import { NextRequest, NextResponse } from "next/server";

interface VisionRequest {
  imageBase64: string; // data:image/png;base64,... or raw base64
  mode?: "meter" | "document";
  apiKey?: string;
  modelName?: string; // optional override; falls back to GEMINI_MODEL env or gemini-2.5-flash-lite
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as VisionRequest;
    const { imageBase64, mode = "meter", apiKey: userApiKey, modelName: reqModelName } = body;

    const apiKey = userApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "กรุณาระบุ Gemini API Key (จาก aistudio.google.com) เพื่อใช้งานโหมด Cloud Vision ความแม่นยำสูง",
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
- Set deviceType to "blood_pressure"
- Look for SYS (Systolic, usually top number, e.g. 110-180)
- Look for DIA (Diastolic, middle number, e.g. 60-100)
- Look for PULSE (Heart rate, bottom number, e.g. 50-100)

If it is a glucose meter:
- Set deviceType to "glucose"
- Extract blood sugar value (e.g. 106) into glucoseValue and value
- Extract unit (mg/dL or mmol/L) into glucoseUnit
- Extract timestamp/date if visible (e.g. 10:38am 12-11) into timestamp
- Set sys, dia, and pulse to null

Return ONLY valid JSON matching this structure:
{
  "deviceType": "blood_pressure" | "glucose" | "utility_meter" | "general_meter",
  "sys": number | null,
  "dia": number | null,
  "pulse": number | null,
  "glucoseValue": number | null,
  "glucoseUnit": string | null,
  "timestamp": string | null,
  "value": string,
  "lines": string[],
  "confidence": number,
  "notes": string
}`;
    } else {
      systemPrompt = `You are an enterprise-grade Thai and English Document OCR & Semantic Intelligence AI.
Your mission is to analyze the document image, identify its category and context, extract all key fields into structured entities, and organize the output into a beautifully structured, highly readable Markdown document.

CRITICAL THAI LANGUAGE & TEXT RULES:
1. Fix all Thai floating vowels and tone marks (สระลอย / วรรณยุกต์ซ้อน). Guarantee correct Thai words (เช่น ที่, ให้, ได้, น้ำ, ค่า, ผู้, เบอร์, ยอด).
2. Eliminate any OCR artifacts, speckles, or noise.
3. Preserve all numbers, transaction codes, tax IDs (13 digits), dates, and currency amounts accurately.

DOCUMENT CLASSIFICATION & FIELD EXTRACTION:
1. **bank_slip (สลิปโอนเงิน / Slip)**:
   - Identify bank (e.g. KBank, SCB, Krungthai, Bangkok Bank, TTB, GSB, PromptPay).
   - Extract: Amount (THB), Sender Name & Account, Receiver Name & Account, Date/Time, Transaction Ref / Trace ID.
2. **receipt_invoice (ใบเสร็จรับเงิน / ใบกำกับภาษี / ใบแจ้งหนี้)**:
   - Extract: Merchant Name, Tax ID (13 digits), Invoice/Receipt No., Date/Time, Customer info.
   - Extract Line Items Table: description, quantity, unit price, line total.
   - Financial breakdown: Subtotal, VAT (7%), Discount, Total Amount.
3. **id_card (บัตรประชาชน / ใบขับขี่ / บัตรข้าราชการ)**:
   - Extract: Identification No. (13 digits), Full Name (TH/EN), Birth Date, Address, Issue/Expiry Date.
4. **medical_document (เอกสารการแพทย์ / ใบรับรองแพทย์ / ผลตรวจแล็บ)**:
   - Extract: Patient Name, Hospital/Clinic, Date, Tests/Diagnoses, Measured Values, Physician.
5. **official_contract (หนังสือราชการ / สัญญา / หนังสือยินยอม)**:
   - Extract: Document Title, Subject, Parties involved, Date, Core clauses/summary.
6. **general_document (เอกสารทั่วไป / รายงาน / แบบฟอร์ม)**:
   - Extract: Document Title, Subject, Date, Key points.

BEAUTIFUL MARKDOWN REQUIREMENTS (for the "markdown" field):
Organize the "markdown" field elegantly so it reads like a premium executive report:
- Header: \`# 📑 [ชื่อประเภทเอกสารและชื่อองค์กร/ร้านค้า/ธนาคาร]\`
- Executive Callout: \`> **ประเภท**: [ประเภท] | **สถานะ**: [สถานะ เช่น สำเร็จ] | **วันที่**: [วันที่]\`
- Divider: \`---\`
- Information Groups with \`### [หัวข้อกลุ่มข้อมูล]\`:
  - Format key-value pairs cleanly: \`- **[ชื่อฟิลด์]**: [ค่าข้อมูล]\`
  - Group logically: e.g. ข้อมูลการชำระเงิน, ข้อมูลคู่สัญญา, ข้อมูลผู้โอน/ผู้รับ, รายละเอียดร้านค้า
- Line Items / Tables: Whenever there are multiple items, products, test results, or tabular data, format them into a clean Markdown Table:
  \`| ลำดับ | รายการ | จำนวน | ราคา/หน่วย | รวมเงิน (บาท) |\`
  \`|:---:|:---|---:|---:|---:|\`
- Financial Summary / Key Numbers: Clearly highlight totals at the bottom (e.g. \`- **ยอดรวมสุทธิ (Total Amount)**: **[ยอดเงิน] บาท**\`).
- Transcribed Text: Under \`### 📝 ข้อความทั้งหมดในเอกสาร (Full Extracted Text)\`, include the complete cleaned transcribed text in proper paragraphs and bullet points without OCR noise.

Return ONLY valid JSON matching this structure:
{
  "docType": "bank_slip" | "receipt_invoice" | "id_card" | "medical_document" | "official_contract" | "general_document",
  "documentTitle": string,
  "summary": string,
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
  "subtotal": number | null,
  "vat": number | null,
  "items": Array<{ name: string, qty?: number, price: number, total?: number }>,
  "metadataFields": Record<string, string>,
  "markdown": string,
  "confidence": number
}`;
    }

    const modelName = reqModelName?.trim() || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;


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
      if (parsedResult && typeof parsedResult.markdown === "string") {
        const { normalizeMarkdown } = await import("@/lib/cleanMarkdown");
        parsedResult.markdown = normalizeMarkdown(parsedResult.markdown);
      }
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
