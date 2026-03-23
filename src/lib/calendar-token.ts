import { createHmac } from "crypto";

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-secret-change-me";
const TOKEN_EXPIRY_HOURS = 72;

/**
 * Generate a signed token for ICS calendar downloads.
 * Token contains freelancer_id + expiry, signed with HMAC-SHA256.
 * No PIN is exposed in the URL.
 */
export function generateCalendarToken(freelancerId: number): string {
  const expiry = Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;
  const payload = `${freelancerId}:${expiry}`;
  const hmac = createHmac("sha256", SECRET).update(payload).digest("hex");
  const token = Buffer.from(`${payload}:${hmac}`).toString("base64url");
  return token;
}

/**
 * Validate a signed calendar token.
 * Returns the freelancer_id if valid, null if invalid or expired.
 */
export function validateCalendarToken(token: string): number | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length !== 3) return null;

    const [freelancerIdStr, expiryStr, providedHmac] = parts;
    const freelancerId = Number(freelancerIdStr);
    const expiry = Number(expiryStr);

    if (isNaN(freelancerId) || isNaN(expiry)) return null;
    if (Date.now() > expiry) return null;

    const payload = `${freelancerId}:${expiry}`;
    const expectedHmac = createHmac("sha256", SECRET).update(payload).digest("hex");

    if (providedHmac !== expectedHmac) return null;
    return freelancerId;
  } catch {
    return null;
  }
}
