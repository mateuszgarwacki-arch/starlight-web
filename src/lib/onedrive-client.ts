import { createClient } from "@/lib/supabase-browser";

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

  const finalName = fileName || `${Date.now()}.${file.name.split(".").pop() || "jpg"}`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);
  formData.append("fileName", finalName);

  const res = await fetch("/api/onedrive/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(err.error || `Upload failed: ${res.status}`);
  }

  const data = await res.json();
  return { path: data.path, downloadUrl: data.downloadUrl, webUrl: data.webUrl };
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
