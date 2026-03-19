import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const body = await request.json();
  const { file_data, media_type } = body;

  if (!file_data || !media_type) {
    return NextResponse.json({ error: "Missing file_data or media_type" }, { status: 400 });
  }

  const isImage = media_type.startsWith("image/");
  const isPdf = media_type === "application/pdf";

  if (!isImage && !isPdf) {
    return NextResponse.json({ error: "Unsupported file type. Use PDF or image." }, { status: 400 });
  }

  const contentBlock = isPdf
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: file_data } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: media_type as "image/jpeg", data: file_data } };

  try {
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
        messages: [{
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `Extract all information from this supplier invoice. Return ONLY valid JSON with no preamble or markdown. Use this exact structure:

{
  "supplier": "Company name from invoice",
  "invoice_number": "Invoice reference number",
  "invoice_date": "YYYY-MM-DD",
  "total": 0.00,
  "currency": "GBP",
  "lines": [
    {
      "line_number": 1,
      "description": "Full product description as written on invoice",
      "quantity": 1,
      "unit": "Each",
      "unit_cost": 0.00,
      "line_total": 0.00
    }
  ]
}

Rules:
- Extract EVERY line item from the invoice
- Keep the full product description exactly as written (don't shorten it)
- If quantity or unit cost is unclear, use your best estimate
- For unit, use: Each, Sheet, Length, Metre, Litre, kg, Pack, Box, Roll
- Dates in YYYY-MM-DD format
- All monetary values as numbers (no currency symbols)
- If VAT is shown separately, exclude it from line totals (use net/ex-VAT values)
- If you cannot determine a field, use null`
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `Claude API error: ${response.status}`, detail: err }, { status: 500 });
    }

    const data = await response.json();
    const text = data.content
      ?.filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("");

    const clean = (text || "").replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(clean);

    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json({ error: "Extraction failed", detail: err.message }, { status: 500 });
  }
}
