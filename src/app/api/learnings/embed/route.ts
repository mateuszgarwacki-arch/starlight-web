import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-admin";

const MODEL = "text-embedding-3-small";
const BATCH_SIZE = 20;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = user.app_metadata?.role || user.user_metadata?.role || "freelancer";
  if (role === "freelancer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apiKey = process.env.OPENAI_API_KEY;
  const admin = createAdminClient();

  const { data: pending, error: fetchErr } = await admin
    .from("tbl_learnings")
    .select("learning_id, headline, detail")
    .eq("embedding_status", "pending")
    .limit(BATCH_SIZE);

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!pending || pending.length === 0) return NextResponse.json({ processed: 0, skipped: 0 });

  if (!apiKey) {
    const ids = pending.map((r) => r.learning_id);
    await admin.from("tbl_learnings").update({ embedding_status: "disabled" }).in("learning_id", ids);
    return NextResponse.json({ processed: 0, disabled: ids.length, note: "OPENAI_API_KEY not configured — marked disabled" });
  }

  const inputs = pending.map((r) =>
    [r.headline, r.detail].filter(Boolean).join("\n\n").slice(0, 8000)
  );

  let embeddings: number[][] = [];
  try {
    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODEL, input: inputs }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      const ids = pending.map((r) => r.learning_id);
      await admin.from("tbl_learnings").update({ embedding_status: "failed" }).in("learning_id", ids);
      return NextResponse.json({ error: `OpenAI ${resp.status}: ${text.slice(0, 300)}` }, { status: 502 });
    }
    const json = await resp.json();
    embeddings = (json.data as { embedding: number[] }[]).map((d) => d.embedding);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  let processed = 0;
  for (let i = 0; i < pending.length; i++) {
    const row = pending[i];
    const vec = embeddings[i];
    if (!vec) continue;
    const { error: updErr } = await admin
      .from("tbl_learnings")
      .update({ embedding: vec as unknown as string, embedding_status: "ready" })
      .eq("learning_id", row.learning_id);
    if (!updErr) processed++;
  }

  const more = pending.length === BATCH_SIZE;
  return NextResponse.json({ processed, more });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
