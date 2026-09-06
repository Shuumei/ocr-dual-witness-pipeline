import { NextRequest, NextResponse } from "next/server";

interface VisionRequest {
  imageBase64: string; // data:image/png;base64,... or raw base64
  mode?: "meter" | "document";
  apiKey?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as VisionRequest;
    const { imageBase64, mode = "meter", apiKey: userApiKey } = body;

    const apiKey = userApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "กรุณาระบุ Gemini API Key (ฟรีจาก aistudio.google.com) เพื่อใช้งานโหมด AI Vision ความแม่นยำสูง",
          needsApiKey: true,
        },
        { status: 400 }
      );
    }

    if (!imageBase64) {
      return NextResponse.json({ error: "Missing imageBase64 data" }, { status: 400 });
    }

    // Strip data url prefix if present
    const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
    const mimeType = imageBase64.startsWith("data:image/png")
      ? "image/png"
      : imageBase64.startsWith("data:image/webp")
      ? "image/webp"
      : "image/jpeg";

    let systemPrompt = "";
    if (mode === "meter") {
      systemPrompt = `You are a high-precision medical & digital meter OCR expert.
Analyze this cropped image of a digital display (e.g. blood pressure monitor, glucose meter, or utility counter).
Extract all digital numbers accurately, even if the display is 7-segment, tilted, or has reflections.

If it is a blood pressure monitor:
- Look for SYS (Systolic, usually top number, e.g. 110-180)
- Look for DIA (Diastolic, middle number, e.g. 60-100)
- Look for PULSE (Heart rate, bottom number, e.g. 50-100)

If it is a glucose meter:
- Extract blood sugar value (e.g. 106) and unit (mg/dL or mmol/L).

Return ONLY valid JSON matching this structure:
{
  "deviceType": "blood_pressure" | "glucose" | "utility_meter" | "general_meter",
  "sys": number | null,
  "dia": number | null,
  "pulse": number | null,
  "value": string,
  "lines": string[],
  "confidence": number,
  "notes": string
}`;
    } else {
      systemPrompt = `You are an expert Thai and English document OCR intelligence model.
Extract and normalize all text from this document image (e.g. bank slip, receipt, tax invoice, or general text).
Fix all Thai floating vowels and tone marks.

If it is a Thai bank transfer slip:
- Extract Bank name, Amount (THB), Sender name, Receiver name, Date/Time, and Transaction Ref number.

If it is a receipt/invoice:
- Extract Merchant name, Tax ID (13 digits), Total amount, VAT, and line items.

Return ONLY valid JSON matching this structure:
{
  "docType": "bank_slip" | "receipt_invoice" | "general_document",
  "bankName": string | null,
  "amount": number | null,
  "amountFormatted": string | null,
  "senderName": string | null,
  "receiverName": string | null,
  "dateTime": string | null,
  "referenceNo": string | null,
  "merchantName": string | null,
  "taxId": string | null,
  "total": number | null,
  "vat": number | null,
  "items": Array<{ name: string, price: number }>,
  "markdown": string,
  "confidence": number
}`;
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          response_mime_type: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `Gemini API Error (${response.status}): ${errText}` },
        { status: response.status }
      );
    }

    const json = await response.json();
    const candidateText =
      json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    let parsedResult;
    try {
      parsedResult = JSON.parse(candidateText);
    } catch {
      parsedResult = { raw: candidateText };
    }

    return NextResponse.json({
      success: true,
      data: parsedResult,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
