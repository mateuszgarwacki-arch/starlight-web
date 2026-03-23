import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateCalendarToken } from "@/lib/calendar-token";

// Generate a signed calendar download token for the authenticated freelancer
// POST /api/calendar/token
// Body: { freelancer_id: number, group?: string }

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const freelancerId = body.freelancer_id || user.user_metadata?.freelancer_id;
  if (!freelancerId) return NextResponse.json({ error: "Missing freelancer_id" }, { status: 400 });

  // Freelancers can only generate tokens for themselves
  const role = user.user_metadata?.role || "freelancer";
  if (role === "freelancer" && Number(freelancerId) !== Number(user.user_metadata?.freelancer_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = generateCalendarToken(Number(freelancerId));
  const baseUrl = `/api/calendar/${freelancerId}?token=${token}`;
  const url = body.group ? `${baseUrl}&group=${body.group}` : baseUrl;

  return NextResponse.json({ url, token });
}
