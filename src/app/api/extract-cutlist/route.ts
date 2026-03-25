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
- "MDF18" or "mdf18" prefix = 18mm MDF sheet material. Match to "18mm MDF" in catalogue.
- "ply18" or "ply_" prefix = 18mm Plywood. "ply12" = 12mm Plywood. Match accordingly.
- "bendy_ply" = flexible/bending plywood (usually 5mm or 3mm)
- Numbers in prefixes usually indicate thickness in mm for sheet goods, or cross-section for timber
- The part description IS the item name. The material must be INFERRED from the prefix and dimensions.
${materialsSection}
CRITICAL RULES FOR SHEET GOODS AND TIMBER:
1. For SHEET materials (Plywood, MDF, acrylic etc.):
   - Standard sheet size is 2440mm x 1220mm unless catalogue says otherwise
   - Calculate how many standard sheets are needed to cut ALL parts of this material
   - Use simple nesting: fit parts on sheets by area with 10% waste factor
   - Return "sheet_count" = number of standard sheets to ORDER
   
2. For TIMBER (PAR, CLS, battens etc.):
   - Standard length is 4800mm (or as specified in catalogue)
   - Calculate how many standard lengths are needed to cut all pieces
   - Simple linear: total cut length / standard length, rounded up, +10% waste
   - Return "standard_length_count" = number of standard lengths to ORDER

3. Group parts by material type — all "mdf18" parts share the same standard sheets

Return ONLY valid JSON:

{
  "lines": [
    {
      "line_number": 1,
      "description": "The part name exactly as written in the cut list",
      "material": "The matched material from catalogue, or best guess (e.g. '18mm MDF', '2x1 PAR Softwood')",
      "material_category": "Timber|Sheet|Metal|Fabric|Hardware|Other",
      "length_mm": 1200,
      "width_mm": 600,
      "thickness_mm": 18,
      "quantity": 2,
      "unit": "Each|Sheet|Metre|Length",
      "notes": "Any grain, edge banding, or special notes",
      "sheet_count": null,
      "standard_length_count": null
    }
  ],
  "material_summary": [
    {
      "material": "18mm MDF",
      "total_parts": 3,
      "total_area_sqm": 0.54,
      "standard_sheet_size": "2440x1220",
      "sheets_needed": 1,
      "waste_pct": 63
    }
  ],
  "summary": {
    "total_parts": 12,
    "material_types": ["18mm MDF", "2x1 PAR Softwood"],
    "source_format": "OpenCutList CSV"
  }
}

IMPORTANT:
- sheet_count and standard_length_count go on the FIRST line of each material group only
- Other lines of the same material get null for these fields
- Every part gets its own line with full dimensions
- If you can't determine the material, set material_category to "Other"`;

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

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
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
      return NextResponse.json({ error: "Failed to parse AI response", raw: clean }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Extraction failed" }, { status: 500 });
  }
}
