import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/auth/preferred-view
 * body: { view: "admin" | "pm" }
 *
 * Writes the chosen view to the caller's own `app_metadata.preferred_view`.
 * Uses service-role to update app_metadata (anon key cannot). The caller must
 * be authenticated — we validate their session from the Authorization header.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "no_auth" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Validate the caller via the anon client
  const anon = createClient(url, anonKey);
  const { data: userData, error: userErr } = await anon.auth.getUser(token);
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "invalid_session" }, { status: 401 });
  }
  const userId = userData.user.id;

  const body = await req.json().catch(() => ({}));
  const view = body?.view;
  if (view !== "admin" && view !== "pm") {
    return NextResponse.json({ error: "view_must_be_admin_or_pm" }, { status: 400 });
  }

  // Merge preferred_view into existing app_metadata
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const existing = (userData.user.app_metadata || {}) as Record<string, unknown>;
  const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...existing, preferred_view: view },
  });
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, view });
}
