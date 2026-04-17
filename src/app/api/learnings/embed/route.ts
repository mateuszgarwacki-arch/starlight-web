import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-admin";

// POST /api/learnings/embed
// Processes pending learnings, generates Voyage AI embeddings, writes back.
// Called fire-and-forget after insert; also safe to call manually for backfill.
//
// Env: VOYAGE_API_KEY — get one at https://dash.voyageai.com
// If missing, rows flip to embedding_status='disabled' (system still works,
// semantic similarity search just returns nothing until the key is added).

const MODEL = "voyage-3-lite";  // 1024 dims, generous free tier
const INPUT_TYPE = "document";  // "document" when indexing; "query" when searching
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

  const apiKey = process.env.VOYAGE_API_KEY;
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
    return NextResponse.json({
      processed: 0,
      disabled: ids.length,
      note: "VOYAGE_API_KEY not configured — marked disabled. Get a free key at https://dash.voyageai.com",
    });
  }

  // Voyage accepts up to 128 strings per request; we stay well under.
  // Truncate long inputs — Voyage context window is 32k tokens but we don't need that much.
  const inputs = pending.map((r) =>
    [r.headline, r.detail].filter(Boolean).join("\n\n").slice(0, 8000)
  );

  let embeddings: number[][] = [];
  try {
    const resp = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        input: inputs,
        input_type: INPUT_TYPE,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      const ids = pending.map((r) => r.learning_id);
      await admin.from("tbl_learnings").update({ embedding_status: "failed" }).in("learning_id", ids);
      return NextResponse.json(
        { error: `Voyage ${resp.status}: ${text.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const json = await resp.json();
    // Voyage response shape mirrors OpenAI's: { data: [{ embedding: [...], index: 0 }, ...] }
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
