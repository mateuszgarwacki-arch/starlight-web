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

const BASES = ["http://127.0.0.1:9100", "https://127.0.0.1:9101"];

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

/** Resolve a printer: the configured default, else the first available printer. */
export async function getPrinter(): Promise<ZebraDevice> {
  const base = await resolveBase();

  try {
    const r = await fetch(`${base}/default?type=printer`);
    if (r.ok) {
      const d = await r.json();
      if (d && d.uid) return d as ZebraDevice;
    }
  } catch {
    /* fall through to /available */
  }

  const r2 = await fetch(`${base}/available`);
  if (r2.ok) {
    const list = await r2.json();
    const printers: ZebraDevice[] = Array.isArray(list)
      ? list
      : (list?.printer ?? []);
    const first = printers.find((p) => p && p.uid);
    if (first) return first;
  }

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
