import { createClient } from "@/lib/supabase-browser";

// Simple upload limit — Vercel functions can't handle > ~4MB body
const SIMPLE_UPLOAD_LIMIT = 3.5 * 1024 * 1024;
// Chunk size for direct-to-OneDrive upload — 3.2MB (multiple of 320KB)
const CHUNK_SIZE = 10 * 320 * 1024;

/** Sanitise a string for use in file/folder names */
function sanitiseName(name: string, maxLen = 80): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, maxLen) || "unnamed";
}

/** Format today's date as YYYY-MM-DD */
function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Build the OneDrive folder path for a job.
 * e.g. "Workshop/13725 - Grosvenor Hotel Wedding"
 */
export function jobFolder(jobNumber: string, jobName: string): string {
  const folder = sanitiseName(`${jobNumber} - ${jobName}`);
  return `Workshop/${folder}`;
}

/**
 * Build a WO photo filename with context.
 * e.g. "CUT+COVER-Bar-Carcass-2026-03-19.jpg"
 */
export function woPhotoName(activityLabel: string, scopeName: string, ext = "jpg"): string {
  const activity = sanitiseName(activityLabel, 30);
  const scope = sanitiseName(scopeName, 40);
  return `${activity}-${scope}-${todayStr()}.${ext}`;
}

/**
 * Build a scope completion photo filename.
 * e.g. "12ft-Circular-Bar-Campsite.jpg"
 */
export function scopePhotoName(scopeName: string, ext = "jpg"): string {
  return `${sanitiseName(scopeName, 70)}.${ext}`;
}

export async function uploadToOneDrive(
  file: File,
  folder: string,
  fileName?: string
): Promise<{ path: string; downloadUrl: string; webUrl: string }> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  const authHeaders = { Authorization: `Bearer ${session.access_token}` };

  const finalName = fileName || `${Date.now()}.${file.name.split(".").pop() || "jpg"}`;

  // Small files: proxy through Vercel (existing flow)
  if (file.size <= SIMPLE_UPLOAD_LIMIT) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);
    formData.append("fileName", finalName);

    const res = await fetch("/api/onedrive/upload", {
      method: "POST",
      headers: authHeaders,
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Upload failed" }));
      throw new Error(err.error || `Upload failed: ${res.status}`);
    }

    const data = await res.json();
    return { path: data.path, downloadUrl: data.downloadUrl, webUrl: data.webUrl };
  }

  // Large files: create session then upload chunks directly to OneDrive
  const sessionRes = await fetch("/api/onedrive/upload-session", {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ folder, fileName: finalName }),
  });

  if (!sessionRes.ok) {
    const err = await sessionRes.json().catch(() => ({ error: "Session failed" }));
    throw new Error(err.error || `Upload session failed: ${sessionRes.status}`);
  }

  const { uploadUrl, path } = await sessionRes.json();
  const buffer = await file.arrayBuffer();
  const totalSize = buffer.byteLength;
  let offset = 0;

  while (offset < totalSize) {
    const end = Math.min(offset + CHUNK_SIZE, totalSize);
    const chunk = buffer.slice(offset, end);

    const chunkRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": `${chunk.byteLength}`,
        "Content-Range": `bytes ${offset}-${end - 1}/${totalSize}`,
      },
      body: chunk,
    });

    if (chunkRes.status === 200 || chunkRes.status === 201) {
      // Final chunk — completed
      const item = await chunkRes.json();
      return {
        path,
        downloadUrl: item["@microsoft.graph.downloadUrl"] || item.webUrl || "",
        webUrl: item.webUrl || "",
      };
    } else if (chunkRes.status === 202) {
      // Accepted — more chunks needed
      offset = end;
    } else {
      const err = await chunkRes.text();
      throw new Error(`Chunk upload failed at ${Math.round(offset / 1024 / 1024)}MB: ${chunkRes.status}`);
    }
  }

  // Shouldn't reach here, but handle gracefully
  return { path, downloadUrl: "", webUrl: "" };
}

export async function getOneDriveUrl(filePath: string): Promise<string> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const res = await fetch(`/api/onedrive/download?path=${encodeURIComponent(filePath)}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (!res.ok) throw new Error("Failed to get download URL");
  const data = await res.json();
  return data.downloadUrl;
}

// Returns a URL that streams the file inline (PDFs/images render in-browser
// rather than downloading). Auth travels via ?token= query param so the URL
// can be passed to window.open() in a fresh tab. Token is the user's own
// short-lived Supabase session — same trust as /api/onedrive/download.
export async function getOneDriveViewUrl(filePath: string): Promise<string> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  const params = new URLSearchParams({
    path: filePath,
    token: session.access_token,
  });
  return `/api/onedrive/view?${params.toString()}`;
}
