/**
 * Minimal Zebra Browser Print client.
 *
 * Browser Print is a small local agent (installed on the print-station PC) that
 * exposes an HTTP API on the loopback interface and relays raw printer commands
 * (ZPL/EPL) straight to a USB or network Zebra printer — bypassing the OS print
 * dialog entirely. This is how we replicate the native MS Access label path:
 * the printer receives ZPL with the label length + gap tracking, so it registers
 * and advances per die-cut label (the "cut" the dialog path was missing).
 *
 * http://127.0.0.1:9100 is used first — Chrome treats loopback as a secure
 * context, so an HTTPS page may call it without mixed-content blocking. The
 * https endpoint (9101, self-signed cert accepted at install) is the fallback.
 */

export interface ZebraDevice {
  name: string;
  uid: string;
  deviceType?: string;
  connection?: string;
  provider?: string;
  manufacturer?: string;
  version?: number;
}

// Zebra's docs point hosted (HTTPS) apps at the https endpoint, and its cert is
// issued for "localhost" — so try https://localhost:9101 first (cert hostname
// match), then the 127.0.0.1 / http variants.
const BASES = [
  "https://localhost:9101",
  "https://127.0.0.1:9101",
  "http://localhost:9100",
  "http://127.0.0.1:9100",
];

let cachedBase: string | null = null;

async function resolveBase(): Promise<string> {
  if (cachedBase) return cachedBase;
  for (const b of BASES) {
    try {
      const res = await fetch(`${b}/available`, { method: "GET" });
      if (res.ok) { cachedBase = b; return b; }
    } catch {
      /* this scheme isn't reachable — try the next */
    }
  }
  throw new Error(
    "Zebra Browser Print isn't responding. Check it's installed and running (icon in the system tray)."
  );
}

/**
 * Resolve a printer. Prefers a loaded, non-"plastic" GT800 — the plastic-stock
 * printer (...Plastic Barcode) is not loaded, so we avoid it explicitly rather
 * than trusting whatever happens to be the Browser Print default.
 */
export async function getPrinter(): Promise<ZebraDevice> {
  const base = await resolveBase();

  // Gather every printer Browser Print can see.
  let printers: ZebraDevice[] = [];
  try {
    const r = await fetch(`${base}/available`);
    if (r.ok) {
      const list = await r.json();
      printers = Array.isArray(list) ? list : (list?.printer ?? []);
    }
  } catch {
    /* ignore — handled below */
  }
  const usable = printers.filter((p) => p && p.uid);
  const isPlastic = (p: ZebraDevice) => /plastic/i.test(p.name || "");

  // 1. First non-plastic printer.
  const preferred = usable.find((p) => !isPlastic(p));
  if (preferred) return preferred;

  // 2. The configured default, as long as it isn't the plastic one.
  try {
    const r = await fetch(`${base}/default?type=printer`);
    if (r.ok) {
      const d = await r.json();
      if (d && d.uid && !isPlastic(d)) return d as ZebraDevice;
    }
  } catch {
    /* ignore */
  }

  // 3. Last resort: anything available.
  if (usable[0]) return usable[0];

  throw new Error(
    "No Zebra printer found. In Browser Print → Settings → Manage, add the GT800 (by IP) and Set it as default."
  );
}

/** Send raw ZPL to a printer (the configured default unless one is passed). */
export async function printZpl(zpl: string, device?: ZebraDevice): Promise<void> {
  const base = await resolveBase();
  const dev = device ?? (await getPrinter());
  const res = await fetch(`${base}/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device: dev, data: zpl }),
  });
  if (!res.ok) throw new Error(`Browser Print error (${res.status}). Is the printer online?`);
}
