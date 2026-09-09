/**
 * Document Intelligence Engine
 * Automatically classifies documents (Bank Slips, Receipts/Invoices, General Documents),
 * extracts structured financial entities, formats tables, and synthesizes clean insights.
 */

import { thaiDigitsToArabic } from "./thaiTextNormalizer";
import type { OcrLine } from "./ocrTypes";

export type DocumentType =
  | "bank_slip"
  | "receipt_invoice"
  | "id_card"
  | "medical_document"
  | "official_contract"
  | "general_document";

export interface BankInfo {
  name: string;
  code: string;
  brandColor: string;
  badgeBg: string;
  textColor: string;
  borderColor: string;
}

export interface BankSlipData {
  bank?: BankInfo;
  amount?: number;
  amountFormatted?: string;
  senderName?: string;
  senderAccount?: string;
  receiverName?: string;
  receiverAccount?: string;
  dateTime?: string;
  referenceNo?: string;
  isSuccessful?: boolean;
}

export interface ReceiptData {
  merchantName?: string;
  taxId?: string;
  dateTime?: string;
  invoiceNo?: string;
  total?: number;
  totalFormatted?: string;
  vat?: number;
  vatFormatted?: string;
  subtotal?: number;
  lineItems: { description: string; qty?: number; price: number }[];
}

export interface DocumentIntelligenceResult {
  docType: DocumentType;
  typeNameTh: string;
  confidence: number;
  bankSlip?: BankSlipData;
  receipt?: ReceiptData;
  extractedMarkdownTable?: string;
  keyInsights: string[];
}

const KNOWN_BANKS: { keywords: string[]; bank: BankInfo }[] = [
  {
    keywords: ["กสิกร", "กสิกรไทย", "kasikorn", "kbank"],
    bank: {
      name: "ธนาคารกสิกรไทย (KBank)",
      code: "KBANK",
      brandColor: "#138f2d",
      badgeBg: "bg-emerald-950/80",
      textColor: "text-emerald-300",
      borderColor: "border-emerald-500/40",
    },
  },
  {
    keywords: ["ไทยพาณิชย์", "scb", "siam commercial"],
    bank: {
      name: "ธนาคารไทยพาณิชย์ (SCB)",
      code: "SCB",
      brandColor: "#4e2a84",
      badgeBg: "bg-purple-950/80",
      textColor: "text-purple-300",
      borderColor: "border-purple-500/40",
    },
  },
  {
    keywords: ["กรุงไทย", "krungthai", "ktb"],
    bank: {
      name: "ธนาคารกรุงไทย (Krungthai)",
      code: "KTB",
      brandColor: "#1ba5e1",
      badgeBg: "bg-sky-950/80",
      textColor: "text-sky-300",
      borderColor: "border-sky-500/40",
    },
  },
  {
    keywords: ["กรุงเทพ", "bangkok bank", "bbl"],
    bank: {
      name: "ธนาคารกรุงเทพ (Bangkok Bank)",
      code: "BBL",
      brandColor: "#1e3f8a",
      badgeBg: "bg-blue-950/80",
      textColor: "text-blue-300",
      borderColor: "border-blue-500/40",
    },
  },
  {
    keywords: ["กรุงศรี", "อยุธยา", "krungsri", "bay"],
    bank: {
      name: "ธนาคารกรุงศรีอยุธยา (Krungsri)",
      code: "BAY",
      brandColor: "#fec43b",
      badgeBg: "bg-amber-950/80",
      textColor: "text-amber-300",
      borderColor: "border-amber-500/40",
    },
  },
  {
    keywords: ["ทหารไทย", "ธนชาต", "ttb", "ทีทีบี"],
    bank: {
      name: "ธนาคารทหารไทยธนชาต (ttb)",
      code: "TTB",
      brandColor: "#002d63",
      badgeBg: "bg-cyan-950/80",
      textColor: "text-cyan-300",
      borderColor: "border-cyan-500/40",
    },
  },
  {
    keywords: ["ออมสิน", "gsb", "government savings"],
    bank: {
      name: "ธนาคารออมสิน (GSB)",
      code: "GSB",
      brandColor: "#eb1985",
      badgeBg: "bg-pink-950/80",
      textColor: "text-pink-300",
      borderColor: "border-pink-500/40",
    },
  },
  {
    keywords: ["พร้อมเพย์", "promptpay"],
    bank: {
      name: "พร้อมเพย์ (PromptPay)",
      code: "PROMPTPAY",
      brandColor: "#003d6b",
      badgeBg: "bg-indigo-950/80",
      textColor: "text-indigo-300",
      borderColor: "border-indigo-500/40",
    },
  },
];

/**
 * Parses numeric price/amount from a string like "1,250.00" or "฿ 450.50"
 */
function parseAmount(text: string): number | null {
  const match = text.match(/([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+(?:\.[0-9]{2}))/);
  if (match) {
    const val = parseFloat(match[1].replace(/,/g, ""));
    return isNaN(val) ? null : val;
  }
  return null;
}

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
}

/**
 * Analyzes OCR lines and text to extract document intelligence.
 */
export function analyzeDocumentIntelligence(rawText: string, lines: OcrLine[] = []): DocumentIntelligenceResult {
  const text = thaiDigitsToArabic(rawText);
  const lower = text.toLowerCase();

  // 1. Detect Document Classification
  const slipKeywords = [
    "โอนเงินสำเร็จ",
    "รายการสำเร็จ",
    "โอนสำเร็จ",
    "สลิป",
    "ผู้โอน",
    "ผู้รับเงิน",
    "จาก",
    "ไปยัง",
    "จำนวนเงิน",
    "รหัสอ้างอิง",
    "เลขที่รายการ",
    "transfer",
    "successful",
    "promptpay",
  ];

  const receiptKeywords = [
    "ใบเสร็จ",
    "ใบกำกับภาษี",
    "ใบเสร็จรับเงิน",
    "tax invoice",
    "receipt",
    "เลขประจำตัวผู้เสียภาษี",
    "vat",
    "ยอดรวม",
    "รวมทั้งสิ้น",
    "รวมเงิน",
    "grand total",
    "subtotal",
    "pos",
    "สาขาที่",
  ];

  let slipScore = 0;
  for (const kw of slipKeywords) {
    if (lower.includes(kw)) slipScore += 2;
  }

  let receiptScore = 0;
  for (const kw of receiptKeywords) {
    if (lower.includes(kw)) receiptScore += 2;
  }

  let docType: DocumentType = "general_document";
  let typeNameTh = "เอกสารทั่วไป (General Document)";
  let confidence = 0.5;

  if (slipScore > receiptScore && slipScore >= 4) {
    docType = "bank_slip";
    typeNameTh = "สลิปโอนเงิน (Bank Transfer Slip)";
    confidence = Math.min(0.98, 0.6 + slipScore * 0.05);
  } else if (receiptScore >= 4) {
    docType = "receipt_invoice";
    typeNameTh = "ใบเสร็จ / ใบกำกับภาษี (Receipt & Invoice)";
    confidence = Math.min(0.98, 0.6 + receiptScore * 0.05);
  }

  const keyInsights: string[] = [];

  // 2. Process Bank Slip
  let bankSlip: BankSlipData | undefined;
  if (docType === "bank_slip") {
    bankSlip = {
      isSuccessful: /สำเร็จ|successful|success/i.test(text),
    };

    // Detect Bank
    for (const b of KNOWN_BANKS) {
      if (b.keywords.some((kw) => lower.includes(kw))) {
        bankSlip.bank = b.bank;
        keyInsights.push(`ธนาคาร: ${b.bank.name}`);
        break;
      }
    }

    // Detect Amount
    // Matches "จำนวนเงิน 1,500.00 บาท" or lines with numbers following keywords
    const amountMatch =
      text.match(/(?:จำนวนเงิน|จำนวน|amount)\s*[:：]?\s*([0-9,]+\.[0-9]{2})/i) ||
      text.match(/([0-9,]+\.[0-9]{2})\s*(?:บาท|thb)/i);

    if (amountMatch) {
      const amt = parseAmount(amountMatch[1]);
      if (amt !== null) {
        bankSlip.amount = amt;
        bankSlip.amountFormatted = formatCurrency(amt);
        keyInsights.push(`ยอดโอนเงิน: ${bankSlip.amountFormatted}`);
      }
    }

    // Detect Sender & Receiver
    const fromMatch = text.match(/(?:จาก|ผู้โอน|from)\s*[:：]?\s*([^\n\r]{2,40})/i);
    if (fromMatch) {
      bankSlip.senderName = fromMatch[1].replace(/^(นาย|นาง|นางสาว|น\.ส\.|บจก\.)\s*/, "$1 ").trim();
    }

    const toMatch = text.match(/(?:ถึง|ผู้รับ|ไปยัง|to)\s*[:：]?\s*([^\n\r]{2,40})/i);
    if (toMatch) {
      bankSlip.receiverName = toMatch[1].replace(/^(นาย|นาง|นางสาว|น\.ส\.|บจก\.)\s*/, "$1 ").trim();
    }

    // Detect Masked Account Numbers (e.g. xxx-x-x1234-x or 123-4-56789-0)
    const accountMatches = text.match(/(?:x{2,}[0-9x-]{3,}|[0-9]{3}-[0-9]-[0-9]{5}-[0-9])/gi);
    if (accountMatches && accountMatches.length > 0) {
      if (!bankSlip.senderAccount && accountMatches[0]) bankSlip.senderAccount = accountMatches[0];
      if (accountMatches[1]) bankSlip.receiverAccount = accountMatches[1];
    }

    // Detect Date and Time
    const dateMatch = text.match(
      /([0-9]{1,2}\s*(?:ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|[A-Za-z]{3})\s*(?:25[0-9]{2}|20[0-9]{2}|[0-9]{2}))/
    );
    const timeMatch = text.match(/([0-9]{1,2}[:.][0-9]{2}(?::[0-9]{2})?\s*(?:น\.|am|pm)?)/i);
    if (dateMatch && timeMatch) {
      bankSlip.dateTime = `${dateMatch[1]} ${timeMatch[1]}`;
      keyInsights.push(`วันเวลา: ${bankSlip.dateTime}`);
    } else if (dateMatch) {
      bankSlip.dateTime = dateMatch[1];
      keyInsights.push(`วันที่: ${bankSlip.dateTime}`);
    }

    // Detect Reference Number
    const refMatch = text.match(/(?:รหัสอ้างอิง|เลขที่รายการ|ref(?:\s*no)?)\s*[:：]?\s*([A-Za-z0-9_-]{6,30})/i);
    if (refMatch) {
      bankSlip.referenceNo = refMatch[1];
      keyInsights.push(`เลขอ้างอิง: ${bankSlip.referenceNo}`);
    }
  }

  // 3. Process Receipt / Invoice
  let receipt: ReceiptData | undefined;
  let extractedMarkdownTable: string | undefined;

  if (docType === "receipt_invoice") {
    receipt = {
      lineItems: [],
    };

    // Merchant Name (often first or second non-empty line)
    const validLines = lines.map((l) => l.text.trim()).filter((l) => l.length > 2);
    if (validLines.length > 0) {
      const candidate = validLines.find((l) => !l.includes("ใบเสร็จ") && !l.includes("tax invoice"));
      if (candidate) {
        receipt.merchantName = candidate;
        keyInsights.push(`ร้านค้า/ผู้ออก: ${receipt.merchantName}`);
      }
    }

    // Tax ID (13 digits)
    const taxMatch = text.match(/(?:เลขประจำตัวผู้เสียภาษี|tax(?:\s*id)?)\s*[:：]?\s*([0-9]{13}|[0-9]-[0-9]{4}-[0-9]{5}-[0-9]{2}-[0-9])/i);
    if (taxMatch) {
      receipt.taxId = taxMatch[1].replace(/[^0-9]/g, "");
      keyInsights.push(`Tax ID: ${receipt.taxId}`);
    }

    // Total Amount
    const totalMatch =
      text.match(/(?:ยอดรวม|รวมทั้งสิ้น|รวมเงิน|total|grand\s*total)\s*[:：]?\s*([0-9,]+\.[0-9]{2})/i);
    if (totalMatch) {
      const tot = parseAmount(totalMatch[1]);
      if (tot !== null) {
        receipt.total = tot;
        receipt.totalFormatted = formatCurrency(tot);
        keyInsights.push(`ยอดรวมสุทธิ: ${receipt.totalFormatted}`);
      }
    }

    // VAT Amount
    const vatMatch = text.match(/(?:ภาษีมูลค่าเพิ่ม|vat(?:\s*7%)?)\s*[:：]?\s*([0-9,]+\.[0-9]{2})/i);
    if (vatMatch) {
      const v = parseAmount(vatMatch[1]);
      if (v !== null) {
        receipt.vat = v;
        receipt.vatFormatted = formatCurrency(v);
      }
    }

    // Extract table items: find lines with description and price at end
    const tableItems: { name: string; price: string }[] = [];
    for (const line of lines) {
      const lineText = line.text.trim();
      const itemMatch = lineText.match(/^(.+?)\s+([0-9,]+\.[0-9]{2})$/);
      if (itemMatch && !/(?:รวม|total|vat|ภาษี|ยอด)/i.test(itemMatch[1])) {
        tableItems.push({
          name: itemMatch[1].trim(),
          price: itemMatch[2].trim(),
        });
      }
    }

    if (tableItems.length >= 2) {
      extractedMarkdownTable = [
        "| รายการสินค้า / บริการ | ราคา (บาท) |",
        "|:---|---:|",
        ...tableItems.map((item) => `| ${item.name} | ${item.price} |`),
      ].join("\n");
    }
  }

  // General Document Insights fallback
  if (keyInsights.length === 0) {
    keyInsights.push(`ความมั่นใจการวิเคราะห์: ${(confidence * 100).toFixed(0)}%`);
    keyInsights.push(`จำนวนบรรทัดที่พบ: ${lines.length} บรรทัด`);
  }

  return {
    docType,
    typeNameTh,
    confidence,
    bankSlip,
    receipt,
    extractedMarkdownTable,
    keyInsights,
  };
}

export function matchThaiBank(text: string): BankInfo | undefined {
  const lower = text.toLowerCase();
  for (const entry of KNOWN_BANKS) {
    if (entry.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return entry.bank;
    }
  }
  return undefined;
}

export interface VisionDocumentData {
  docType?: DocumentType;
  documentTitle?: string | null;
  summary?: string | null;
  bankName?: string | null;
  amount?: number | null;
  amountFormatted?: string | null;
  senderName?: string | null;
  receiverName?: string | null;
  dateTime?: string | null;
  referenceNo?: string | null;
  merchantName?: string | null;
  taxId?: string | null;
  total?: number | null;
  subtotal?: number | null;
  vat?: number | null;
  items?: Array<{ name: string; qty?: number; price: number; total?: number }>;
  metadataFields?: Record<string, string>;
  markdown?: string;
  confidence?: number;
}

export function buildIntelligenceFromVision(d: VisionDocumentData): DocumentIntelligenceResult {
  const knownTypes: DocumentType[] = [
    "bank_slip",
    "receipt_invoice",
    "id_card",
    "medical_document",
    "official_contract",
    "general_document",
  ];

  const docType: DocumentType =
    d.docType && knownTypes.includes(d.docType)
      ? d.docType
      : d.bankName || d.amountFormatted
      ? "bank_slip"
      : d.taxId || d.merchantName
      ? "receipt_invoice"
      : "general_document";

  let bankSlip: BankSlipData | undefined = undefined;
  if (docType === "bank_slip" || d.bankName || d.amountFormatted) {
    const bank = d.bankName ? matchThaiBank(d.bankName) : undefined;
    const amt = d.amount ? Number(d.amount) : undefined;
    bankSlip = {
      bank,
      amount: amt,
      amountFormatted:
        d.amountFormatted ||
        (amt ? `${amt.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท` : undefined),
      senderName: d.senderName || undefined,
      receiverName: d.receiverName || undefined,
      dateTime: d.dateTime || undefined,
      referenceNo: d.referenceNo || undefined,
      isSuccessful: true,
    };
  }

  let receipt: ReceiptData | undefined = undefined;
  if (docType === "receipt_invoice" || d.merchantName || d.total) {
    const tot = d.total ? Number(d.total) : undefined;
    const v = d.vat ? Number(d.vat) : undefined;
    const sub = d.subtotal ? Number(d.subtotal) : undefined;
    receipt = {
      merchantName: d.merchantName || undefined,
      taxId: d.taxId || undefined,
      dateTime: d.dateTime || undefined,
      subtotal: sub,
      total: tot,
      totalFormatted: tot ? `${tot.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท` : undefined,
      vat: v,
      vatFormatted: v ? `${v.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท` : undefined,
      lineItems: (d.items || []).map((i) => ({ description: i.name, qty: i.qty, price: i.price })),
    };
  }

  let extractedMarkdownTable: string | undefined = undefined;
  if (d.items && d.items.length > 0) {
    const hasQty = d.items.some((i) => i.qty !== undefined && i.qty !== null);
    if (hasQty) {
      extractedMarkdownTable = [
        "| ลำดับ | รายการสินค้า / บริการ | จำนวน | ราคา/หน่วย | รวมเงิน (บาท) |",
        "|:---:|:---|---:|---:|---:|",
        ...d.items.map(
          (i, idx) =>
            `| ${idx + 1} | ${i.name} | ${i.qty ?? 1} | ${i.price.toLocaleString("th-TH", { minimumFractionDigits: 2 })} | ${(
              (i.qty ?? 1) * i.price
            ).toLocaleString("th-TH", { minimumFractionDigits: 2 })} |`
        ),
      ].join("\n");
    } else {
      extractedMarkdownTable = [
        "| ลำดับ | รายการสินค้า / บริการ | ราคา (บาท) |",
        "|:---:|:---|---:|",
        ...d.items.map(
          (i, idx) =>
            `| ${idx + 1} | ${i.name} | ${i.price.toLocaleString("th-TH", { minimumFractionDigits: 2 })} |`
        ),
      ].join("\n");
    }
  }

  const typeNameTh =
    docType === "bank_slip"
      ? `สลิปโอนเงิน (${bankSlip?.bank?.name || d.bankName || "ธนาคาร"})`
      : docType === "receipt_invoice"
      ? `ใบเสร็จ / ใบกำกับภาษี (${receipt?.merchantName || d.merchantName || "ร้านค้า"})`
      : docType === "id_card"
      ? `บัตรประจำตัวประชาชน / เอกสารยืนยันตัวตน`
      : docType === "medical_document"
      ? `เอกสารทางการแพทย์ / ผลตรวจแล็บ`
      : docType === "official_contract"
      ? `หนังสือราชการ / สัญญา / ข้อตกลง`
      : d.documentTitle || "เอกสารทั่วไป (General Document)";

  const insights: string[] = [`ประเภทเอกสาร: ${typeNameTh}`];
  if (d.summary) {
    insights.push(`สรุปสาระสำคัญ: ${d.summary}`);
  }
  if (d.metadataFields && typeof d.metadataFields === "object") {
    for (const [k, v] of Object.entries(d.metadataFields)) {
      if (v) insights.push(`${k}: ${v}`);
    }
  }
  insights.push("วิเคราะห์และจัดโครงสร้างด้วย Gemini Vision Intelligence");

  return {
    docType,
    typeNameTh,
    confidence: d.confidence ?? 0.98,
    bankSlip,
    receipt,
    extractedMarkdownTable,
    keyInsights: insights,
  };
}


