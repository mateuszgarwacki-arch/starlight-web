import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-admin";

const MODEL = "voyage-3-lite";
const INPUT_TYPE = "document";
const BATCH_SIZE = 20;

// GET /api/learnings/embed
// Diagnostic + manual trigger. No auth required for diagnostic mode (?diag=1).
// Without diag flag, requires bearer token like POST.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const isDiag = url.searchParams.get("diag") === "1";

  if (isDiag) {
    // Quick health check — does the Voyage key work?
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        ok: false,
        step: "env",
        error: "VOYAGE_API_KEY not set in Vercel environment",
      });
    }

    // Try a minimal embedding request
    try {
      const resp = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          input: ["diagnostic test"],
          input_type: INPUT_TYPE,
        }),
      });
      const text = await resp.text();
      if (!resp.ok) {
        return NextResponse.json({
          ok: false,
          step: "voyage_call",
          status: resp.status,
          voyage_response: text.slice(0, 500),
          key_prefix: apiKey.slice(0, 6) + "…",
          key_length: apiKey.length,
        });
      }
      const json = JSON.parse(text);
      const dims = json.data?.[0]?.embedding?.length ?? 0;
      return NextResponse.json({
        ok: true,
        step: "complete",
        voyage_status: resp.status,
        model: MODEL,
        dims_returned: dims,
        key_prefix: apiKey.slice(0, 6) + "…",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      return NextResponse.json({ ok: false, step: "voyage_fetch_exception", error: msg });
    }
  }

  return POST(request);
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return NextResponse.json({ error: "Unauthorized - no auth header" }, { status: 401 });

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized - no user" }, { status: 401 });
  const role = user.app_metadata?.role || user.user_metadata?.role || "freelancer";
  if (role === "freelancer") return NextResponse.json({ error: "Forbidden - role=" + role }, { status: 403 });

  const apiKey = process.env.VOYAGE_API_KEY;
  const admin = createAdminClient();

  const { data: pending, error: fetchErr } = await admin
    .from("tbl_learnings")
    .select("learning_id, headline, detail")
    .eq("embedding_status", "pending")
    .limit(BATCH_SIZE);

  if (fetchErr) return NextResponse.json({ error: "DB fetch: " + fetchErr.message }, { status: 500 });
  if (!pending || pending.length === 0) return NextResponse.json({ processed: 0, skipped: 0 });

  if (!apiKey) {
    const ids = pending.map((r) => r.learning_id);
    await admin.from("tbl_learnings").update({ embedding_status: "disabled" }).in("learning_id", ids);
    return NextResponse.json({
      processed: 0,
      disabled: ids.length,
      note: "VOYAGE_API_KEY not configured",
    });
  }

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
      body: JSON.stringify({ model: MODEL, input: inputs, input_type: INPUT_TYPE }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      const ids = pending.map((r) => r.learning_id);
      await admin.from("tbl_learnings").update({ embedding_status: "failed" }).in("learning_id", ids);
      return NextResponse.json({ error: `Voyage ${resp.status}: ${text.slice(0, 300)}` }, { status: 502 });
    }

    const json = await resp.json();
    embeddings = (json.data as { embedding: number[] }[]).map((d) => d.embedding);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: "Fetch exception: " + msg }, { status: 500 });
  }

  let processed = 0;
  const updateErrors: string[] = [];
  for (let i = 0; i < pending.length; i++) {
    const row = pending[i];
    const vec = embeddings[i];
    if (!vec) continue;
    const { error: updErr } = await admin
      .from("tbl_learnings")
      .update({ embedding: vec as unknown as string, embedding_status: "ready" })
      .eq("learning_id", row.learning_id);
    if (updErr) updateErrors.push(updErr.message);
    else processed++;
  }

  return NextResponse.json({
    processed,
    pending_found: pending.length,
    more: pending.length === BATCH_SIZE,
    update_errors: updateErrors.length ? updateErrors.slice(0, 3) : undefined,
  });
}
