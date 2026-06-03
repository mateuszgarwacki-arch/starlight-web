"use client";

import { useEffect, useState } from "react";
import { Eye, Layers } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase-browser";
import { getAuthHeaders } from "@/lib/auth-headers";

// Short, truthful role labels for the identity chip. A non-staff role shows
// in red so a wrong login (e.g. a freelancer/test session) is impossible to miss.
const ROLE_SHORT: Record<string, string> = {
  admin: "Admin",
  production_manager: "PM",
  "Production-Manager": "PM",
  foreman: "Foreman",
  freelancer: "Crew",
};

/**
 * Header-placed view switcher. Flips between:
 *   - "admin" — /, /jobs, /workshop, etc. (full system)
 *   - "pm"    — /pm/jobs/... (100m overview)
 *
 * Persists the choice to `app_metadata.preferred_view` so next sign-in lands
 * on the right view. Does not block access — anyone can flip either way.
 */
export function ViewSwitcher() {
  const supabase = createClient();
  const [current, setCurrent] = useState<"admin" | "pm" | null>(null);
  const [busy, setBusy] = useState(false);
  const [identity, setIdentity] = useState<{ label: string; role: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const pref =
        (data.user?.app_metadata as any)?.preferred_view ??
        (data.user?.user_metadata as any)?.preferred_view;
      // Capture the *real* signed-in identity (not the view) so it's always visible.
      const email = data.user?.email ?? "";
      const role =
        ((data.user?.app_metadata as any)?.role ??
          (data.user?.user_metadata as any)?.role ??
          "freelancer") as string;
      setIdentity({ label: email.split("@")[0] || email, role });
      // Fallback: infer from current path
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      if (pref === "admin" || pref === "pm") setCurrent(pref);
      else setCurrent(path.startsWith("/pm") ? "pm" : "admin");
    })();
  }, []);

  const flip = async (to: "admin" | "pm") => {
    if (busy || current === to) return;
    setBusy(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/auth/preferred-view", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ view: to }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "save_failed" }));
        throw new Error(error || "save_failed");
      }
      setCurrent(to);
      // Navigate to the landing page of the chosen view
      window.location.href = to === "pm" ? "/pm/jobs" : "/";
    } catch (e: any) {
      toast.error(`Switch failed: ${e.message ?? e}`);
      setBusy(false);
    }
  };

  if (!current) return null;

  const isStaff = identity ? identity.role !== "freelancer" : true;

  return (
    <div className="inline-flex items-center gap-2">
      {identity && (
        <span
          className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted"
          title={`Signed in as ${identity.label} (${identity.role})`}
        >
          <span className="font-mono">{identity.label}</span>
          <span
            className={
              "px-1.5 py-0.5 rounded font-medium " +
              (isStaff ? "bg-navy/10 text-navy" : "bg-starlight-red/15 text-starlight-red")
            }
          >
            {ROLE_SHORT[identity.role] ?? identity.role}
          </span>
        </span>
      )}
      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-mid border border-subtle text-xs">
        <button
          onClick={() => flip("admin")}
          disabled={busy}
          className={
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors " +
            (current === "admin"
              ? "bg-navy/15 text-navy font-medium"
              : "text-muted hover:text-navy")
          }
          title="Full admin view — all screens, full editing"
        >
          <Layers className="h-3 w-3" /> Admin view
        </button>
        <button
          onClick={() => flip("pm")}
          disabled={busy}
          className={
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors " +
            (current === "pm"
              ? "bg-starlight-blue/15 text-starlight-blue font-medium"
              : "text-muted hover:text-navy")
          }
          title="PM 100m overview — quote-line-first, read-only"
        >
          <Eye className="h-3 w-3" /> PM view
        </button>
      </div>
    </div>
  );
}
