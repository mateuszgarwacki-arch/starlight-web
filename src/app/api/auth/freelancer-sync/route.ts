import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  // Require authenticated PM session
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = user.user_metadata?.role || "freelancer";
  if (role !== "production_manager" && role !== "Production-Manager") {
    return NextResponse.json({ error: "Only production managers can manage crew auth" }, { status: 403 });
  }

  // Now proceed with admin operations
  const admin = createAdminClient();
  const body = await request.json();
  const { freelancer_id, phone, pin, role: targetRole, name } = body;

  if (!freelancer_id || !phone || !pin) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const email = phone.replace(/\s+/g, "") + "@starlight.local";
  const userRole = targetRole || "freelancer";

  // Check if auth user already exists
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const existing = existingUsers?.users?.find((u: any) => u.email === email);

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: pin,
      user_metadata: { freelancer_id, role: userRole, name: name || "" },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ status: "updated", auth_id: existing.id });
  } else {
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
