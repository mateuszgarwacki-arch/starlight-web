import { NextRequest, NextResponse } from "next/server";
import { getDownloadUrlByPath } from "@/lib/microsoft-graph";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const filePath = request.nextUrl.searchParams.get("path");
    if (!filePath) return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });

    const downloadUrl = await getDownloadUrlByPath(filePath);
    return NextResponse.json({ downloadUrl });
  } catch (err: any) {
    console.error("OneDrive download error:", err);
    return NextResponse.json({ error: err.message || "Download failed" }, { status: 500 });
  }
}
