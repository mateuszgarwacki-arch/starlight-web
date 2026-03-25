// ============================================================
// Microsoft Graph Client — OneDrive Integration
// Uses client credentials flow (app-only, no user sign-in)
// ============================================================

interface GraphToken {
  access_token: string;
  expires_at: number;
}

let cachedToken: GraphToken | null = null;

export async function getGraphToken(): Promise<string> {
  if (cachedToken && cachedToken.expires_at > Date.now() + 300000) {
    return cachedToken.access_token;
  }

  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft Graph credentials not configured. Set MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET in Vercel.");
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph token request failed: ${res.status} — ${err}`);
  }

  const data = await res.json();
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in * 1000),
  };

  return cachedToken.access_token;
}

// ============================================================
// File operations
// ============================================================

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function getDrivePath(): string {
  const driveId = process.env.MICROSOFT_DRIVE_ID;
  if (driveId) return `drives/${driveId}`;
  const driveSite = process.env.MICROSOFT_DRIVE_SITE;
  if (driveSite) return `sites/${driveSite}/drive`;
  const driveUser = process.env.MICROSOFT_DRIVE_USER;
  if (driveUser) return `users/${driveUser}/drive`;
  throw new Error("Set MICROSOFT_DRIVE_ID, MICROSOFT_DRIVE_SITE, or MICROSOFT_DRIVE_USER in Vercel.");
}

// Simple upload limit — Graph API rejects PUT > 4MB
const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024;
// Chunk size for resumable upload — 10MB (must be multiple of 320KB)
const CHUNK_SIZE = 10 * 320 * 1024; // 3,276,800 bytes ≈ 3.1MB (safe multiple)

export async function uploadFile(
  folderPath: string,
  fileName: string,
  fileBuffer: ArrayBuffer,
  contentType: string
): Promise<{ id: string; webUrl: string; downloadUrl: string }> {
  const token = await getGraphToken();
  const drivePath = getDrivePath();
  const encodedPath = `${folderPath}/${fileName}`.replace(/\/\//g, "/");

  // Small files: simple PUT
  if (fileBuffer.byteLength <= SIMPLE_UPLOAD_LIMIT) {
    const url = `${GRAPH_BASE}/${drivePath}/root:/${encodedPath}:/content`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      body: new Uint8Array(fileBuffer),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OneDrive upload failed: ${res.status} — ${err}`);
    }
    const item = await res.json();
    return {
      id: item.id,
      webUrl: item.webUrl,
      downloadUrl: item["@microsoft.graph.downloadUrl"] || item.webUrl,
    };
  }

  // Large files: resumable upload session
  const sessionUrl = `${GRAPH_BASE}/${drivePath}/root:/${encodedPath}:/createUploadSession`;
  const sessionRes = await fetch(sessionUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      item: { "@microsoft.graph.conflictBehavior": "replace" },
    }),
  });
  if (!sessionRes.ok) {
    const err = await sessionRes.text();
    throw new Error(`OneDrive upload session failed: ${sessionRes.status} — ${err}`);
  }
  const session = await sessionRes.json();
  const uploadUrl = session.uploadUrl;
  const totalSize = fileBuffer.byteLength;
  let offset = 0;
  let lastItem: any = null;

  while (offset < totalSize) {
    const end = Math.min(offset + CHUNK_SIZE, totalSize);
    const chunk = fileBuffer.slice(offset, end);
    const chunkRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": `${chunk.byteLength}`,
        "Content-Range": `bytes ${offset}-${end - 1}/${totalSize}`,
      },
      body: new Uint8Array(chunk),
    });
    if (chunkRes.status === 200 || chunkRes.status === 201) {
      // Final chunk — server returns the completed item
      lastItem = await chunkRes.json();
      break;
    } else if (chunkRes.status === 202) {
      // Accepted — more chunks needed
      offset = end;
    } else {
      const err = await chunkRes.text();
      throw new Error(`OneDrive chunk upload failed at ${offset}: ${chunkRes.status} — ${err}`);
    }
  }

  if (!lastItem) {
    throw new Error("OneDrive upload completed but no item returned");
  }

  return {
    id: lastItem.id,
    webUrl: lastItem.webUrl,
    downloadUrl: lastItem["@microsoft.graph.downloadUrl"] || lastItem.webUrl,
  };
}

export async function getDownloadUrl(itemId: string): Promise<string> {
  const token = await getGraphToken();
  const drivePath = getDrivePath();
  const res = await fetch(`${GRAPH_BASE}/${drivePath}/items/${itemId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`OneDrive download URL failed: ${res.status}`);
  const item = await res.json();
  return item["@microsoft.graph.downloadUrl"] || item.webUrl;
}

export async function getDownloadUrlByPath(filePath: string): Promise<string> {
  const token = await getGraphToken();
  const drivePath = getDrivePath();
  const res = await fetch(`${GRAPH_BASE}/${drivePath}/root:/${filePath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`OneDrive file not found: ${res.status} — ${filePath}`);
  const item = await res.json();
  return item["@microsoft.graph.downloadUrl"] || item.webUrl;
}

export async function createSharingLink(itemId: string): Promise<string> {
  const token = await getGraphToken();
  const drivePath = getDrivePath();
  const res = await fetch(`${GRAPH_BASE}/${drivePath}/items/${itemId}/createLink`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "view", scope: "organization" }),
  });
  if (!res.ok) throw new Error(`OneDrive sharing link failed: ${res.status}`);
  const data = await res.json();
  return data.link.webUrl;
}
