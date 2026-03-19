import { createClient } from "@/lib/supabase-browser";

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
