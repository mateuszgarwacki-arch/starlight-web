import { createClient } from "@/lib/supabase-browser";

/**
 * Get the current Supabase session's Authorization header.
 * Use this when calling internal API routes that require auth.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}
