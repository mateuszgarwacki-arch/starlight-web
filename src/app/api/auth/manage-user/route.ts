import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  // Require authenticated admin or PM session
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const callerRole = user.app_metadata?.role || user.user_metadata?.role || "freelancer";
  const isAdmin = callerRole === "admin";
  const isPM = ["production_manager", "Production-Manager"].includes(callerRole);
  if (!isAdmin && !isPM) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const body = await request.json();
  const { action } = body;

  // ===== CREATE STAFF ACCOUNT =====
  if (action === "create_staff") {
    const { freelancer_id, email, password, role: targetRole, name } = body;
    if (!freelancer_id || !email || !password || !targetRole) {
      return NextResponse.json({ error: "Missing fields: freelancer_id, email, password, role" }, { status: 400 });
    }

    // Only admin can create other admins
    if (targetRole === "admin" && !isAdmin) {
      return NextResponse.json({ error: "Only admins can create admin accounts" }, { status: 403 });
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { freelancer_id, role: targetRole, name: name || "" },
      app_metadata: { role: targetRole },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ status: "created", auth_id: data.user.id });
  }

  // ===== UPDATE ROLE =====
  if (action === "update_role") {
    const { auth_user_id, new_role, freelancer_id } = body;
    if (!auth_user_id || !new_role) {
      return NextResponse.json({ error: "Missing auth_user_id or new_role" }, { status: 400 });
    }

    // Only admin can promote to admin
    if (new_role === "admin" && !isAdmin) {
      return NextResponse.json({ error: "Only admins can assign admin role" }, { status: 403 });
    }

    const { error } = await admin.auth.admin.updateUserById(auth_user_id, {
      user_metadata: { role: new_role },
      app_metadata: { role: new_role },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Also update tbl_freelancers.role if freelancer_id provided
    if (freelancer_id) {
      await userSupabase.from("tbl_freelancers").update({ role: new_role }).eq("freelancer_id", freelancer_id);
    }
    return NextResponse.json({ status: "role_updated" });
  }

  // ===== RESET PASSWORD =====
  if (action === "reset_password") {
    const { auth_user_id, new_password } = body;
    if (!auth_user_id || !new_password) {
      return NextResponse.json({ error: "Missing auth_user_id or new_password" }, { status: 400 });
    }
    const { error } = await admin.auth.admin.updateUserById(auth_user_id, {
      password: new_password,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ status: "password_reset" });
  }

  // ===== LIST AUTH USERS =====
  if (action === "list_users") {
    const { data, error } = await admin.auth.admin.listUsers();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Return only non-freelancer accounts (staff)
    const staff = (data.users || [])
      .filter((u: any) => {
        const r = u.app_metadata?.role || u.user_metadata?.role || "freelancer";
        return ["admin", "production_manager", "Production-Manager", "foreman"].includes(r);
      })
      .map((u: any) => ({
        auth_id: u.id,
        email: u.email,
        name: u.user_metadata?.name || "",
        role: u.app_metadata?.role || u.user_metadata?.role || "unknown",
        freelancer_id: u.user_metadata?.freelancer_id || null,
        created_at: u.created_at,
        last_sign_in: u.last_sign_in_at,
      }));
    return NextResponse.json({ users: staff });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
