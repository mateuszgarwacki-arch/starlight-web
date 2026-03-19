import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const body = await request.json();
  const { file_data, media_type, csv_text, file_name } = body;

  // Two paths: raw CSV text (parsed client-side) or PDF/image (needs AI vision)
  const isCSV = !!csv_text;
  const isPdf = media_type === "application/pdf";
  const isImage = media_type?.startsWith("image/");

  if (!isCSV && !file_data) {
    return NextResponse.json({ error: "Missing file_data or csv_text" }, { status: 400 });
  }

  const prompt = `You are extracting a cut list / bill of materials from a workshop document.
This is from OpenCutList (SketchUp plugin) or a similar cut list tool used in scenic/event fabrication.

Extract every material line. Return ONLY valid JSON with no preamble or markdown:

{
  "lines": [
    {
      "line_number": 1,
      "description": "Full part name/description as written",
      "material": "Material type (e.g. 18mm Birch Ply, 2x1 PAR Softwood, 6mm MDF)",
      "material_category": "Timber|Sheet|Metal|Fabric|Hardware|Other",
      "length_mm": 1200,
      "width_mm": 600,
      "thickness_mm": 18,
      "quantity": 2,
      "unit": "Each|Sheet|Metre|Length",
      "notes": "Any grain direction, edge banding, or special notes"
    }
  ],
  "summary": {
    "total_parts": 12,
    "material_types": ["18mm Birch Ply", "2x1 PAR Softwood"],
    "source_format": "OpenCutList CSV|Custom CSV|PDF Cut List|Unknown"
  }
}

RULES:
- Every distinct part gets its own line
- If quantity > 1, keep as one line with the quantity (don't repeat)
- Dimensions should be in millimetres. Convert from inches/cm if needed.
- For timber: length is along the grain. Width and thickness describe the cross section.
- For sheet goods: length and width are the cut size. Thickness is the sheet thickness.
- Material category must be one of: Timber, Sheet, Metal, Fabric, Hardware, Other
- If a column meaning is ambiguous, use the most likely interpretation
- Preserve the original description/name exactly as written
- If dimensions are missing, set to null (don't guess)`;

  try {
    let messages: any[];

    if (isCSV) {
      // CSV text - send as plain text to Claude
      messages = [{
        role: "user",
        content: `Here is a cut list CSV file (${file_name || "cutlist.csv"}):\n\n${csv_text}\n\n${prompt}`
      }];
    } else if (isPdf) {
      messages = [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: file_data } },
          { type: "text", text: prompt }
        ]
      }];
    } else if (isImage) {
      messages = [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type, data: file_data } },
          { type: "text", text: prompt }
        ]
      }];
    } else {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `Claude API error: ${response.status} — ${errText}` }, { status: 500 });
    }

    const result = await response.json();
    const text = result.content?.map((c: any) => c.text || "").join("") || "";
    const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response", raw: clean }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Extraction failed" }, { status: 500 });
  }
}
