import { NextRequest, NextResponse } from "next/server";
import { uploadFile } from "@/lib/microsoft-graph";
import { createClient } from "@supabase/supabase-js";

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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folder = formData.get("folder") as string || "Starlight/Uploads";
    const fileName = formData.get("fileName") as string || `${Date.now()}.jpg`;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const result = await uploadFile(folder, fileName, arrayBuffer, file.type || "application/octet-stream");

    return NextResponse.json({
      success: true,
      id: result.id,
      webUrl: result.webUrl,
      downloadUrl: result.downloadUrl,
      path: `${folder}/${fileName}`,
    });
  } catch (err: any) {
    console.error("OneDrive upload error:", err);
    return NextResponse.json({ error: err.message || "Upload failed" }, { status: 500 });
  }
}
