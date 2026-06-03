"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";

/**
 * Client-side guard for the desktop (PM/Admin) interface.
 *
 * The desktop and the /m crew app share one Supabase session in the browser
 * (same project = same storage key), so a freelancer-role token can end up
 * rendering the desktop UI. Reads are open to any authenticated user, so the
 * UI half-renders and then 403s on every write — confusing and easy to miss.
 *
 * This bounces a *definitively* non-staff session to /m. It is deliberately
 * fail-open: if the role can't be read (network error, missing claim) it does
 * NOTHING, so a transient hiccup can never lock a real Admin/PM out of their
 * own interface. Only a clearly non-staff role triggers the redirect.
 */
const STAFF_ROLES = ["admin", "production_manager", "Production-Manager", "foreman"];

export function RoleGuard() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getUser();
      if (cancelled || error || !data.user) return; // fail open

      const role =
        (data.user.app_metadata as any)?.role ??
        (data.user.user_metadata as any)?.role ??
        null;

      // Only redirect when we positively know this is a non-staff role.
      if (role && !STAFF_ROLES.includes(role)) {
        window.location.href = "/m";
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
