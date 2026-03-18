import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const admin = createAdminClient();
  const body = await request.json();
  const { freelancer_id, phone, pin, role, name } = body;

  if (!freelancer_id || !phone || !pin) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const email = phone.replace(/\s+/g, "") + "@starlight.local";
  const userRole = role || "freelancer";

  // Check if auth user already exists
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const existing = existingUsers?.users?.find((u: any) => u.email === email);

  if (existing) {
    // Update password and metadata
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: pin,
      user_metadata: { freelancer_id, role: userRole, name: name || "" },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ status: "updated", auth_id: existing.id });
  } else {
    // Create new auth user
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
      user_metadata: { freelancer_id, role: userRole, name: name || "" },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ status: "created", auth_id: data.user.id });
  }
}
