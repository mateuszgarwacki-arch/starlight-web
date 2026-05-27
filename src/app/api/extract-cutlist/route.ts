import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  // Auth check — require valid session (PM or foreman only)
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = user.app_metadata?.role || user.user_metadata?.role || "freelancer";
  if (role === "freelancer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const body = await request.json();
  const { file_data, media_type, csv_text, file_name, materials_context } = body;

  const isCSV = !!csv_text;
  if (!isCSV && !file_data) {
    return NextResponse.json({ error: "Missing file_data or csv_text" }, { status: 400 });
  }

  const isPdf = media_type === "application/pdf";
  const isImage = media_type?.startsWith("image/");

  const materialsSection = materials_context
    ? `\n\nMATERIALS CATALOGUE (use these to match and identify materials):\n${materials_context}\n`
    : "";

  const prompt = `You are extracting a cut list from an OpenCutList CSV export or similar workshop document for a scenic/event fabrication company.

NAMING CONVENTIONS USED IN THIS WORKSHOP:
- Part names often use material prefixes: "2x1_upright" means a 2x1 PAR Softwood part called "upright"
- "2x1" = 2x1 PAR Softwood (cross-section 44mm x 19mm, any length). Match to "2x1 PAR Softwood" in catalogue.
- "3x1" = 3x1 PAR Softwood (cross-section 70mm x 19mm, any length).
- "MDF18" or "mdf18" prefix = 18mm MDF sheet material. Match to "18mm MDF" in catalogue.
- "ply18" or "ply_" prefix = 18mm Plywood. "ply12" = 12mm Plywood. "ply9" = 9mm Plywood. Match accordingly.
- "bendy_ply" = flexible/bending plywood (usually 5mm or 3mm)
- Numbers in prefixes usually indicate thickness in mm for sheet goods, or cross-section for timber
- The part description IS the item name. The material must be INFERRED from the prefix and dimensions.
${materialsSection}
PART LABELS:
- Extract "part_label" from the source if present. Common sources:
  * An explicit column in OpenCutList CSV/PDF ("Number", "Label", "Ref", "ID", "Part")
  * A short alphanumeric prefix on the part name (e.g. "P1 - upright", "A.2 backboard", "[3] side")
  * A numbered reference visible on the source document or drawing
- Use the source's own labels verbatim — do not invent, reformat, or renumber.
- If no label exists in the source, set part_label to null (do not generate one).

YOUR ONLY JOB: Extract the individual parts list. Do NOT attempt to calculate sheet counts, standard lengths, or totals — the frontend will compute these.

For material_category use EXACTLY ONE of: Timber, Sheet, Metal, Fabric, Hardware, Other.
- Timber = PAR, CLS, battens, dimensional lumber (has a meaningful length, small cross-section)
- Sheet = Plywood, MDF, acrylic, any sheet material (has length AND width, thin thickness)

Return ONLY valid JSON with no preamble:

{
  "lines": [
    {
      "line_number": 1,
      "part_label": "P1",
      "description": "The part name exactly as written in the cut list",
      "material": "The matched material from catalogue, or best guess (e.g. '18mm General Plywood 8x4', '3x1 PAR')",
      "material_category": "Timber|Sheet|Metal|Fabric|Hardware|Other",
      "length_mm": 1200,
      "width_mm": 600,
      "thickness_mm": 18,
      "quantity": 2,
      "unit": "Each",
      "notes": "Any grain, edge banding, or special notes from the source"
    }
  ],
  "summary": {
    "total_parts": 12,
    "material_types": ["18mm General Plywood 8x4", "3x1 PAR"],
    "source_format": "OpenCutList PDF"
  }
}

IMPORTANT:
- Every part gets its own line with full dimensions and quantity
- If the source has a totals/summary section, IGNORE it — only extract individual parts
- If you can't determine the material, set material_category to "Other"
- quantity must reflect the ACTUAL count of this part from the source document`;

  try {
    let messages: any[];

    if (isCSV) {
      messages = [{ role: "user", content: `Cut list file (${file_name || "cutlist.csv"}):\n\n${csv_text}\n\n${prompt}` }];
    } else if (isPdf) {
      messages = [{ role: "user", content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: file_data } },
        { type: "text", text: prompt }
      ]}];
    } else if (isImage) {
      messages = [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type, data: file_data } },
        { type: "text", text: prompt }
      ]}];
    } else {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
    if (isPdf) headers["anthropic-beta"] = "pdfs-2024-09-25";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 4000, messages }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `Claude API error: ${response.status} — ${errText}` }, { status: 500 });
    }

    const result = await response.json();
    const text = result.content?.map((c: any) => c.text || "").join("") || "";
    const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let parsed;
    try { parsed = JSON.parse(clean); } catch {
      // Try extracting JSON object from surrounding text
      const firstBrace = clean.indexOf("{");
      const lastBrace = clean.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try { parsed = JSON.parse(clean.slice(firstBrace, lastBrace + 1)); } catch {
          return NextResponse.json({ error: "Failed to parse AI response", raw: clean.slice(0, 500) }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: "Failed to parse AI response", raw: clean.slice(0, 500) }, { status: 500 });
      }
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Extraction failed" }, { status: 500 });
  }
}
