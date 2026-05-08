// View a OneDrive file inline in the browser. Proxies the file body with
// Content-Disposition: inline so PDFs/images render in a new tab instead of
// triggering a download (which is what /api/onedrive/download does — that
// route returns Microsoft's signed URL, and the OneDrive CDN forces
// attachment disposition).
//
// Auth: prefers Authorization header; falls back to ?token= query param so
// window.open() can pass the user's Supabase access token in a fresh tab
// (where headers can't be set). The token is the user's own short-lived
// session — same trust boundary as /api/onedrive/download.
//
// The body is streamed (not buffered) so large files work within Vercel
// function memory limits.
import { NextRequest } from "next/server";
import { getDownloadUrlByPath } from "@/lib/microsoft-graph";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  try {
    const headerAuth = request.headers.get("authorization");
    const queryToken = request.nextUrl.searchParams.get("token");
    const authHeader = headerAuth || (queryToken ? `Bearer ${queryToken}` : null);
    if (!authHeader) return new Response("Unauthorized", { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });

    const filePath = request.nextUrl.searchParams.get("path");
    if (!filePath) return new Response("Missing path parameter", { status: 400 });

    // Get a signed CDN URL from Graph (1-hour-ish lifetime, no further auth).
    const downloadUrl = await getDownloadUrlByPath(filePath);

    // Fetch the file. Pass body straight through for streaming.
    const fileRes = await fetch(downloadUrl);
    if (!fileRes.ok || !fileRes.body) {
      return new Response("File fetch failed", { status: fileRes.status || 502 });
    }

    const fileName = (filePath.split("/").pop() || "file").replace(/"/g, "");
    const mimeType = fileRes.headers.get("content-type") || "application/octet-stream";

    return new Response(fileRes.body, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${fileName}"`,
        // Brief private cache helps if the user reloads the tab; not shared.
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err: any) {
    console.error("OneDrive view error:", err);
    return new Response(err.message || "View failed", { status: 500 });
  }
}
