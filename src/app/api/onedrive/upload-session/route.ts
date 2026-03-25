import { NextRequest, NextResponse } from "next/server";
import { getGraphToken } from "@/lib/microsoft-graph";
import { createClient } from "@supabase/supabase-js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function getDrivePath(): string {
  const driveId = process.env.MICROSOFT_DRIVE_ID;
  if (driveId) return `drives/${driveId}`;
  throw new Error("MICROSOFT_DRIVE_ID not set");
}

export async function POST(request: NextRequest) {
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

    const { folder, fileName } = await request.json();
    if (!folder || !fileName) {
      return NextResponse.json({ error: "folder and fileName required" }, { status: 400 });
    }

    const token = await getGraphToken();
    const drivePath = getDrivePath();
    const filePath = `${folder}/${fileName}`.replace(/\/\//g, "/");
    const url = `${GRAPH_BASE}/${drivePath}/root:/${filePath}:/createUploadSession`;

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        item: { "@microsoft.graph.conflictBehavior": "replace" },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Session failed: ${err}` }, { status: res.status });
    }

    const session = await res.json();
    return NextResponse.json({
      uploadUrl: session.uploadUrl,
      expirationDateTime: session.expirationDateTime,
      path: filePath,
    });
  } catch (err: any) {
    console.error("Upload session error:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
