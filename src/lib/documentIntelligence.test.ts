import { describe, it, expect } from "vitest";
import { analyzeDocumentIntelligence, buildIntelligenceFromVision } from "./documentIntelligence";

describe("documentIntelligence", () => {
  it("classifies KBank transfer slip and extracts financial entities", () => {
    const slipText = `
      โอนเงินสำเร็จ
      ธนาคารกสิกรไทย
      15 ส.ค. 2569 14:30 น.
      จาก นาย สมชาย ใจดี
      xxx-x-x1234-x
      ไปยัง นาง สมศรี มั่งมี
      xxx-x-x5678-x
      จำนวนเงิน 1,500.00 บาท
      รหัสอ้างอิง 2026081599887711
    `;

    const result = analyzeDocumentIntelligence(slipText);
    expect(result.docType).toBe("bank_slip");
    expect(result.bankSlip?.bank?.code).toBe("KBANK");
    expect(result.bankSlip?.amount).toBe(1500);
    expect(result.bankSlip?.amountFormatted).toBe("1,500.00 บาท");
    expect(result.bankSlip?.senderName).toContain("สมชาย");
    expect(result.bankSlip?.receiverName).toContain("สมศรี");
    expect(result.bankSlip?.referenceNo).toBe("2026081599887711");
    expect(result.bankSlip?.isSuccessful).toBe(true);
  });

  it("classifies SCB transfer slip with Thai digits", () => {
    const slipText = `
      รายการสำเร็จ
      ธนาคารไทยพาณิชย์
      จำนวนเงิน ๒,๔๕๐.๕๐ บาท
      จาก นาย ชัยยศ
      รหัสอ้างอิง SCB12345678
    `;

    const result = analyzeDocumentIntelligence(slipText);
    expect(result.docType).toBe("bank_slip");
    expect(result.bankSlip?.bank?.code).toBe("SCB");
    expect(result.bankSlip?.amount).toBe(2450.5);
    expect(result.bankSlip?.amountFormatted).toBe("2,450.50 บาท");
  });

  it("classifies tax invoice/receipt and extracts line items", () => {
    const receiptText = `
      บริษัท สยามรีเทล จำกัด
      ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ
      เลขประจำตัวผู้เสียภาษี 0105558123456
      กาแฟอเมริกาโน่ 65.00
      แซนวิชแฮมชีส 45.00
      ครัวซองต์เนยสด 55.00
      ยอดรวม 165.00
      ภาษีมูลค่าเพิ่ม 10.80
    `;

    const lines = [
      { text: "บริษัท สยามรีเทล จำกัด", confidence: 0.9, bbox: { x0: 0, y0: 0, x1: 100, y1: 20 } },
      { text: "ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ", confidence: 0.9, bbox: { x0: 0, y0: 25, x1: 100, y1: 45 } },
      { text: "เลขประจำตัวผู้เสียภาษี 0105558123456", confidence: 0.9, bbox: { x0: 0, y0: 50, x1: 100, y1: 70 } },
      { text: "กาแฟอเมริกาโน่ 65.00", confidence: 0.9, bbox: { x0: 0, y0: 75, x1: 100, y1: 95 } },
      { text: "แซนวิชแฮมชีส 45.00", confidence: 0.9, bbox: { x0: 0, y0: 100, x1: 100, y1: 120 } },
      { text: "ครัวซองต์เนยสด 55.00", confidence: 0.9, bbox: { x0: 0, y0: 125, x1: 100, y1: 145 } },
      { text: "ยอดรวม 165.00", confidence: 0.9, bbox: { x0: 0, y0: 150, x1: 100, y1: 170 } },
    ];

    const result = analyzeDocumentIntelligence(receiptText, lines);
    expect(result.docType).toBe("receipt_invoice");
    expect(result.receipt?.taxId).toBe("0105558123456");
    expect(result.receipt?.total).toBe(165);
    expect(result.receipt?.vat).toBe(10.8);
    expect(result.extractedMarkdownTable).toBeDefined();
    expect(result.extractedMarkdownTable).toContain("กาแฟอเมริกาโน่");
  });

  it("handles general documents appropriately", () => {
    const generalText = "สัญญาว่าจ้างบริการซอฟต์แวร์ ระหว่างคู่สัญญา ข้อตกลงทั่วไป";
    const result = analyzeDocumentIntelligence(generalText);
    expect(result.docType).toBe("general_document");
    expect(result.bankSlip).toBeUndefined();
  });

  it("builds intelligence from AI vision data", () => {
    const aiData = {
      docType: "bank_slip" as const,
      bankName: "กสิกรไทย",
      amount: 500,
      amountFormatted: "500.00 บาท",
      senderName: "สมชาย",
      receiverName: "สมหวัง",
      dateTime: "06/09/2026 10:00",
      referenceNo: "REF123456",
      confidence: 0.99,
    };
    const result = buildIntelligenceFromVision(aiData);
    expect(result.docType).toBe("bank_slip");
    expect(result.bankSlip?.bank?.code).toBe("KBANK");
    expect(result.bankSlip?.amount).toBe(500);
    expect(result.bankSlip?.referenceNo).toBe("REF123456");
  });
});

