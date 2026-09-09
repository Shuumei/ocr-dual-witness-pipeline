"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Gauge,
  KeyRound,
  Layers,
  RefreshCw,
  RotateCw,
  Sliders,
  Sparkles,
  Upload,
  Zap,
} from "lucide-react";
import { SevenSegmentDisplay } from "@/components/SevenSegmentDisplay";
import { reconcileWitnesses, type ConsensusResult, type WitnessReading } from "@/lib/consensus";
import { decodeDisplay, decodeDisplayAutoAlign, type PixelSource, type Polarity } from "@/lib/imageDecoder";
import { getSvgPixels } from "@/lib/getSvgPixels";
import { SAMPLE_METERS } from "@/lib/samples";
import { reconcileTextWitnesses, type TextConsensusResult, type TextWitnessResult } from "@/lib/textConsensus";
import { linesToMarkdown } from "@/lib/formatAsMarkdown";
import { normalizeMarkdown, markdownToPlainText } from "@/lib/cleanMarkdown";
import type { OcrProgress } from "@/lib/textOcr";
import type { DocumentIntelligenceResult, BankSlipData, ReceiptData } from "@/lib/documentIntelligence";

// shadcn/ui components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StepProgress } from "@/components/ui/step-progress";

type Mode = "meter" | "document";
export type EngineMode = "dual_hybrid" | "local_only" | "ai_only";

export default function Home() {
  const [mode, setMode] = useState<Mode>("meter");
  const [stagedDocumentFile, setStagedDocumentFile] = useState<File | null>(null);

  // Lazy initialize state from localStorage to avoid cascading renders in useEffect
  const [apiKey, setApiKey] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("ocr_gemini_api_key") || "";
    }
    return "";
  });
  const [engineMode, setEngineMode] = useState<EngineMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("ocr_engine_mode") as EngineMode) || "dual_hybrid";
    }
    return "dual_hybrid";
  });
  const [geminiModel, setGeminiModel] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("ocr_gemini_model") || "gemini-2.5-flash-lite";
    }
    return "gemini-2.5-flash-lite";
  });

  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [tempKey, setTempKey] = useState<string>("");
  const [tempEngineMode, setTempEngineMode] = useState<EngineMode>("dual_hybrid");
  const [tempModel, setTempModel] = useState<string>("gemini-2.5-flash-lite");
  const [isCustomModel, setIsCustomModel] = useState(false);

  const PRESET_MODELS = [
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", desc: "เร็ว ประหยัดโควต้า แนะนำสำหรับการใช้งานทั่วไป" },
    { id: "gemini-2.5-flash",      label: "Gemini 2.5 Flash",      desc: "สมดุลระหว่างความแม่นยำและความเร็ว" },
    { id: "gemini-2.5-pro",        label: "Gemini 2.5 Pro",        desc: "ความแม่นยำสูงสุด เหมาะสำหรับเอกสารซับซ้อน" },
  ];

  function openSettings() {
    setTempKey(apiKey);
    setTempEngineMode(engineMode);
    const isPreset = PRESET_MODELS.some((m) => m.id === geminiModel);
    setIsCustomModel(!isPreset);
    setTempModel(geminiModel);
    setShowKeyModal(true);
  }

  function handleSaveKey() {
    const trimmedKey = tempKey.trim();
    const trimmedModel = tempModel.trim() || "gemini-2.5-flash-lite";
    setApiKey(trimmedKey);
    setEngineMode(tempEngineMode);
    setGeminiModel(trimmedModel);
    if (typeof window !== "undefined") {
      localStorage.setItem("ocr_gemini_api_key", trimmedKey);
      localStorage.setItem("ocr_engine_mode", tempEngineMode);
      localStorage.setItem("ocr_gemini_model", trimmedModel);
    }
    setShowKeyModal(false);
  }

  function handleSwitchToDocument(file: File) {
    setStagedDocumentFile(file);
    setMode("document");
  }

  const isAiActive = Boolean(apiKey);

  return (
    <div className="min-h-screen flex flex-col bg-[#f6f7f9] text-slate-800 antialiased">
      {/* Modern Minimal Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
              <Layers className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm sm:text-base tracking-tight text-slate-900 whitespace-nowrap">
                  OCR Dual-Witness
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden xs:block">
                Consensus Verification Pipeline
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="h9"
              onClick={openSettings}
              className="group border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 shadow-xs"
            >
              <KeyRound className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
              <span className="hidden sm:inline font-medium">Engine Settings</span>
              <span className="sm:hidden font-medium">Settings</span>
              {isAiActive ? (
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-slate-300" />
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        {/* Sub-header & Engine Status Banner */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
                Dual-Witness Consensus Engine
                <Badge variant="emerald" className="text-xs font-normal">
                  v2.0
                </Badge>
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-slate-600 max-w-3xl leading-relaxed">
                ระบบตรวจสอบเอกสารและมิเตอร์ดิจิตอลสองชั้น (Dual-Witness) โดยตรวจสอบความสอดคล้องของผลลัพธ์
                หากผลอ่านตรงกันจะยกระดับความมั่นใจ พร้อมตรวจจับจุดคลาดเคลื่อนเพื่อความถูกต้องสูงสุด
              </p>
            </div>
          </div>

          {/* Engine Status Card */}
          <Card className="border-slate-200/90 bg-white p-0 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3">
              <div className="flex items-start sm:items-center gap-3">
                <div
                  className={`mt-0.5 sm:mt-0 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                    isAiActive
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-100 text-slate-500"
                  }`}
                >
                  {isAiActive ? <Sparkles className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs sm:text-sm font-semibold text-slate-900">
                      {!apiKey
                        ? "⚠ กรุณาตั้งค่า Gemini API Key"
                        : engineMode === "dual_hybrid"
                        ? "Dual-Witness Hybrid Active"
                        : "Cloud Vision Direct Active"}
                    </span>
                    <Badge variant={isAiActive ? "emerald" : "amber"} className="text-[10px] py-0 h-4">
                      {isAiActive ? geminiModel : "API Key Required"}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    {!apiKey ? (
                      <>ต้องการ Gemini API Key เพื่อวิเคราะห์รูปจริง — <button onClick={openSettings} className="text-slate-900 hover:text-black underline font-semibold">ตั้งค่าที่นี่</button></>
                    ) : engineMode === "dual_hybrid" ? (
                      <>Witness A (Local Model) + Witness B ({geminiModel}) ตรวจสอบสองชั้น</>
                    ) : (
                      <>ประมวลผลด้วย {geminiModel} Vision Model ความแม่นยำสูง</>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openSettings}
                  className="h-8 text-xs border-slate-200 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50"
                >
                  {apiKey ? "ปรับแต่งโหมด" : "เปิดโหมด Cloud ฟรี"}
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </Card>
        </section>

        {/* Mode Switcher Tabs */}
        <div className="w-full">
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <div className="flex border-b border-slate-200/90 pb-px">
              <TabsList className="bg-slate-100 p-1 border border-slate-200">
                <TabsTrigger value="meter" className="gap-2 px-4 py-2 text-xs sm:text-sm">
                  <Gauge className="h-4 w-4" />
                  <span>Meter Reading (7-Segment & LCD)</span>
                </TabsTrigger>
                <TabsTrigger value="document" className="gap-2 px-4 py-2 text-xs sm:text-sm">
                  <FileText className="h-4 w-4" />
                  <span>Document & Thai OCR (สลิป/ใบเสร็จ)</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="meter">
              <MeterMode
                onSwitchToDocument={handleSwitchToDocument}
                apiKey={apiKey}
                engineMode={engineMode}
                geminiModel={geminiModel}
                onOpenSettings={openSettings}
              />
            </TabsContent>

            <TabsContent value="document">
              <DocumentMode
                initialFile={stagedDocumentFile}
                onFileConsumed={() => setStagedDocumentFile(null)}
                apiKey={apiKey}
                engineMode={engineMode}
                geminiModel={geminiModel}
                onOpenSettings={openSettings}
              />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Settings Dialog */}
      <Dialog open={showKeyModal} onOpenChange={setShowKeyModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 font-semibold">
              <Sliders className="h-5 w-5 text-slate-900" />
              การตั้งค่า OCR Engine & Cloud Witness
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs sm:text-sm">
              เลือกสถาปัตยกรรมประมวลผล และระบุ Gemini API Key เพื่อเปิดใช้งาน Dual-Witness AI Engine
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Engine Mode */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700">
                รูปแบบการประมวลผล (Engine Architecture):
              </label>
              <div className="space-y-2">
                {/* Option 1: Dual Hybrid */}
                <div
                  onClick={() => setTempEngineMode("dual_hybrid")}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all ${
                    tempEngineMode === "dual_hybrid"
                      ? "border-black bg-slate-100/90 text-slate-950 ring-1 ring-black"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <input type="radio" name="engineMode" checked={tempEngineMode === "dual_hybrid"}
                    onChange={() => setTempEngineMode("dual_hybrid")} className="mt-1 accent-black cursor-pointer" />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs sm:text-sm text-slate-900">Dual-Witness Hybrid (แนะนำ)</span>
                      <Badge variant="secondary" className="text-[10px] py-0 h-4 font-mono">Consensus</Badge>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Witness A (Local WASM) + Witness B ({tempModel}) ตรวจสอบสองชั้น ความแม่นยำสูงสุด
                    </p>
                  </div>
                </div>

                {/* Option 2: AI Only */}
                <div
                  onClick={() => setTempEngineMode("ai_only")}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all ${
                    tempEngineMode === "ai_only"
                      ? "border-black bg-slate-100/90 text-slate-950 ring-1 ring-black"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <input type="radio" name="engineMode" checked={tempEngineMode === "ai_only"}
                    onChange={() => setTempEngineMode("ai_only")} className="mt-1 accent-black cursor-pointer" />
                  <div className="space-y-0.5">
                    <span className="font-semibold text-xs sm:text-sm text-slate-900">Cloud Vision Only ({tempModel})</span>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      ส่งรูปไปยัง Gemini Vision โดยตรง เหมาะสำหรับภาพที่เอียง มีแสงสะท้อน หรือสลิปธนาคารซับซ้อน
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Gemini Model Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700">เลือก Gemini Vision Model:</label>
              <div className="grid grid-cols-1 gap-1.5">
                {PRESET_MODELS.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => { setTempModel(m.id); setIsCustomModel(false); }}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-all ${
                      !isCustomModel && tempModel === m.id
                        ? "border-black bg-slate-100/90 ring-1 ring-black"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <input type="radio" name="geminiModel" checked={!isCustomModel && tempModel === m.id}
                      onChange={() => { setTempModel(m.id); setIsCustomModel(false); }}
                      className="accent-black cursor-pointer shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900">{m.label}</div>
                      <div className="text-[11px] text-slate-500 truncate">{m.desc}</div>
                    </div>
                  </div>
                ))}
                {/* Custom model option */}
                <div
                  onClick={() => setIsCustomModel(true)}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-all ${
                    isCustomModel
                      ? "border-black bg-slate-100/90 ring-1 ring-black"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <input type="radio" name="geminiModel" checked={isCustomModel}
                    onChange={() => setIsCustomModel(true)} className="accent-black cursor-pointer shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1.5">
                    <div className="text-xs font-semibold text-slate-900">Custom Model Name</div>
                    {isCustomModel && (
                      <Input
                        placeholder="e.g. gemini-2.0-flash, gemini-1.5-pro"
                        value={tempModel}
                        onChange={(e) => setTempModel(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-8 text-xs font-mono text-slate-900 bg-white"
                        autoFocus
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* API Key section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-slate-700">Gemini API Key (Google AI Studio):</label>
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer"
                  className="text-slate-900 hover:underline hover:text-black inline-flex items-center gap-1 font-semibold">
                  รับ API Key ฟรี ↗
                </a>
              </div>
              <Input
                type="password"
                placeholder="AIzaSy..."
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                className="font-mono text-xs text-slate-900 bg-white"
              />
              <p className="text-[11px] text-slate-500 leading-relaxed">
                API Key จะถูกจัดเก็บไว้เฉพาะใน Browser ของคุณ (localStorage) ไม่มีการบันทึกบนเซิร์ฟเวอร์
              </p>
            </div>
          </div>

          <DialogFooter>
            {apiKey && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTempKey("");
                  setTempEngineMode("local_only");
                }}
                className="mr-auto text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              >
                ล้างข้อมูล Key
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowKeyModal(false)}>
              ยกเลิก
            </Button>
            <Button variant="default" size="sm" onClick={handleSaveKey}>
              บันทึกการตั้งค่า
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Helper: Canvas Crop & Rotate                                           */
/* ---------------------------------------------------------------------- */

async function getCroppedRotatedCanvas(
  file: File,
  rotation: number,
  cropBox: { top: number; left: number; width: number; height: number }
): Promise<HTMLCanvasElement> {
  const img = new Image();
  const url = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });

  URL.revokeObjectURL(url);

  const angleRad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(angleRad));
  const cos = Math.abs(Math.cos(angleRad));

  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

  // Max dimension constraint to prevent browser lag on high-res photos
  const maxDim = 1200;
  const initialScale = Math.min(1, maxDim / Math.max(origW, origH));
  const scaledW = Math.round(origW * initialScale);
  const scaledH = Math.round(origH * initialScale);

  const rotW = Math.round(scaledW * cos + scaledH * sin);
  const rotH = Math.round(scaledW * sin + scaledH * cos);

  const rotCanvas = document.createElement("canvas");
  rotCanvas.width = rotW;
  rotCanvas.height = rotH;
  const rCtx = rotCanvas.getContext("2d");
  if (!rCtx) throw new Error("Could not create canvas context");

  rCtx.fillStyle = "#ffffff";
  rCtx.fillRect(0, 0, rotW, rotH);

  rCtx.translate(rotW / 2, rotH / 2);
  rCtx.rotate(angleRad);
  rCtx.drawImage(img, -scaledW / 2, -scaledH / 2, scaledW, scaledH);

  // Calculate crop coordinates
  const cropX = Math.max(0, Math.round((cropBox.left / 100) * rotW));
  const cropY = Math.max(0, Math.round((cropBox.top / 100) * rotH));
  const cropW = Math.max(10, Math.min(rotW - cropX, Math.round((cropBox.width / 100) * rotW)));
  const cropH = Math.max(10, Math.min(rotH - cropY, Math.round((cropBox.height / 100) * rotH)));

  const outCanvas = document.createElement("canvas");
  outCanvas.width = cropW;
  outCanvas.height = cropH;
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) throw new Error("Could not create cropped canvas");

  outCtx.drawImage(rotCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return outCanvas;
}

function getBloodPressureCategory(sys: number, dia: number): { label: string; badgeVariant: "emerald" | "amber" | "destructive" } {
  if (sys < 120 && dia < 80) {
    return { label: "ความดันปกติ (Normal)", badgeVariant: "emerald" };
  }
  if (sys <= 129 && dia < 80) {
    return { label: "ความดันเริ่มสูง (Elevated)", badgeVariant: "amber" };
  }
  if (sys <= 139 || (dia >= 80 && dia <= 89)) {
    return { label: "ความดันสูงระดับ 1 (Stage 1 Hypertension)", badgeVariant: "amber" };
  }
  return { label: "ความดันสูงระดับ 2 (Stage 2 Hypertension)", badgeVariant: "destructive" };
}

function getGlucoseCategory(
  val: number,
  unit: string = "mg/dL"
): { label: string; badgeVariant: "emerald" | "amber" | "destructive"; desc: string } {
  const mgdl = unit.toLowerCase().includes("mmol") ? val * 18 : val;
  if (mgdl < 70) {
    return {
      label: "น้ำตาลต่ำ (Hypoglycemia)",
      badgeVariant: "destructive",
      desc: "ระดับน้ำตาลต่ำกว่า 70 mg/dL ควรได้รับคาร์โบไฮเดรตเร็วทันที",
    };
  }
  if (mgdl <= 99) {
    return {
      label: "ปกติก่อนอาหาร (Normal Fasting)",
      badgeVariant: "emerald",
      desc: "ระดับน้ำตาลอยู่ในเกณฑ์ปกติสำหรับผู้ที่อดอาหาร (70-99 mg/dL)",
    };
  }
  if (mgdl <= 125) {
    return {
      label: "เสี่ยงเบาหวาน (Pre-diabetes)",
      badgeVariant: "amber",
      desc: "น้ำตาลก่อนอาหารสูงกว่าเกณฑ์ปกติ (100-125 mg/dL)",
    };
  }
  if (mgdl <= 199) {
    return {
      label: "ปกติหลังอาหาร / สูงเล็กน้อย",
      badgeVariant: "amber",
      desc: "เกณฑ์หลังอาหารปกติ (< 140 mg/dL) หรือสูงเล็กน้อย (140-199 mg/dL)",
    };
  }
  return {
    label: "น้ำตาลสูง (Hyperglycemia)",
    badgeVariant: "destructive",
    desc: "สูงกว่า 200 mg/dL ควรปรึกษาแพทย์หรือตรวจซ้ำ",
  };
}

/* ---------------------------------------------------------------------- */
/* Mode 1: Calibrated 7-Segment Meter Reading                             */
/* ---------------------------------------------------------------------- */

interface MeterAnalyzeResult {
  witnessA: WitnessReading;
  witnessB: WitnessReading;
  result: ConsensusResult;
  extractedLines?: string[];
  isMultiLine?: boolean;
  isLikelyDocOrSlip?: boolean;
  deviceType?: "blood_pressure" | "glucose" | "utility_meter" | "general_meter";
  glucoseValue?: number | string | null;
  glucoseUnit?: string | null;
  timestamp?: string | null;
}

function runMeterWitnesses(pixels: PixelSource, polarity: Polarity, autoAlign: boolean): MeterAnalyzeResult {
  const decode = autoAlign ? decodeDisplayAutoAlign : decodeDisplay;
  const a = decode(pixels, { sampleMode: "point", thresholdMode: "fixed", polarity, startMargin: 4 });
  const b = decode(pixels, { sampleMode: "region", thresholdMode: "adaptive", polarity, startMargin: 4 });
  const witnessA: WitnessReading = { raw: a.reading, confidence: a.confidence, witness: "witness-a" };
  const witnessB: WitnessReading = { raw: b.reading, confidence: b.confidence, witness: "witness-b" };
  return { witnessA, witnessB, result: reconcileWitnesses(witnessA, witnessB) };
}

function MeterMode({
  onSwitchToDocument,
  apiKey,
  engineMode,
  geminiModel,
  onOpenSettings,
}: {
  onSwitchToDocument: (file: File) => void;
  apiKey: string;
  engineMode: EngineMode;
  geminiModel: string;
  onOpenSettings: () => void;
}) {
  const [selectedSampleId, setSelectedSampleId] = useState(SAMPLE_METERS[0].id);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MeterAnalyzeResult | null>(null);
  const [copiedResult, setCopiedResult] = useState(false);
  const [copiedWitnessA, setCopiedWitnessA] = useState(false);
  const [copiedWitnessB, setCopiedWitnessB] = useState(false);

  function copyMeterConsensus() {
    if (!data) return;
    let textToCopy = "";
    if (data.deviceType === "glucose" || data.glucoseValue) {
      textToCopy = `ระดับน้ำตาลในเลือด: ${data.glucoseValue || data.result.consensus} ${data.glucoseUnit || "mg/dL"}${data.timestamp ? ` (${data.timestamp})` : ""}`;
    } else if (data.extractedLines && data.extractedLines.length >= 2 && !isNaN(Number(data.extractedLines[0]))) {
      textToCopy = `SYS (ความดันตัวบน): ${data.extractedLines[0]} mmHg\nDIA (ความดันตัวล่าง): ${data.extractedLines[1]} mmHg\nPULSE (ชีพจร): ${data.extractedLines[2] || "—"} bpm`;
    } else {
      textToCopy = `ค่าอ่านมิเตอร์ (Consensus): ${data.result.consensus ?? "Unresolved"}\nความมั่นใจ: ${(data.result.confidence * 100).toFixed(0)}%\nสถานะ: ${data.result.status}`;
    }
    navigator.clipboard.writeText(textToCopy);
    setCopiedResult(true);
    setTimeout(() => setCopiedResult(false), 2000);
  }

  function copyWitness(text: string, which: "a" | "b") {
    navigator.clipboard.writeText(text);
    if (which === "a") {
      setCopiedWitnessA(true);
      setTimeout(() => setCopiedWitnessA(false), 2000);
    } else {
      setCopiedWitnessB(true);
      setTimeout(() => setCopiedWitnessB(false), 2000);
    }
  }

  // Manual ROI crop & rotation controls
  const [useCrop, setUseCrop] = useState(true);
  const [cropBox, setCropBox] = useState({ top: 30, left: 35, width: 30, height: 28 });
  const [rotation, setRotation] = useState<number>(0);

  // Interactive drag selector
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const selectedSample = SAMPLE_METERS.find((m) => m.id === selectedSampleId)!;

  // Update preview canvas
  useEffect(() => {
    if (!uploadedFile || !previewCanvasRef.current) return;
    let active = true;

    getCroppedRotatedCanvas(uploadedFile, rotation, cropBox)
      .then((canvas) => {
        if (!active || !previewCanvasRef.current) return;
        const pCanvas = previewCanvasRef.current;
        pCanvas.width = 180;
        pCanvas.height = 180;
        const ctx = pCanvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, 180, 180);
        ctx.fillStyle = "#f1f5f9";
        ctx.fillRect(0, 0, 180, 180);

        const scale = Math.min(180 / canvas.width, 180 / canvas.height);
        const drawW = canvas.width * scale;
        const drawH = canvas.height * scale;
        const offsetX = (180 - drawW) / 2;
        const offsetY = (180 - drawH) / 2;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(canvas, offsetX, offsetY, drawW, drawH);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [uploadedFile, rotation, cropBox]);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setDragStart({ x, y });
    setIsDragging(true);
    setCropBox({ left: Math.round(x), top: Math.round(y), width: 5, height: 5 });
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging || !dragStart || !imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const currentY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    const left = Math.round(Math.min(dragStart.x, currentX));
    const top = Math.round(Math.min(dragStart.y, currentY));
    const width = Math.round(Math.max(5, Math.abs(currentX - dragStart.x)));
    const height = Math.round(Math.max(5, Math.abs(currentY - dragStart.y)));

    setCropBox({ left, top, width, height });
  }

  function handlePointerUp() {
    setIsDragging(false);
    setDragStart(null);
  }

  async function handleAnalyze() {
    setLoading(true);
    setCurrentStep(1);
    setError(null);
    setData(null);

    try {
      if (uploadedFile) {
        const croppedCanvas = await getCroppedRotatedCanvas(uploadedFile, rotation, cropBox);

        // Transition to Step 2
        setCurrentStep(2);

        const isAiActive = Boolean(apiKey);

        if (isAiActive && engineMode === "ai_only") {
          const base64 = croppedCanvas.toDataURL("image/jpeg", 0.95);
          const res = await fetch("/api/vision", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: base64, mode: "meter", apiKey, modelName: geminiModel }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "AI Vision request failed");

          setCurrentStep(3);

          const d = json.data;
          const lines: string[] =
            d.lines && d.lines.length > 0
              ? d.lines.map(String)
              : [d.sys, d.dia, d.pulse].filter((v: unknown) => v !== null && v !== undefined).map(String);
          const rawVal = lines.length > 0 ? lines.join(" / ") : String(d.value || "");
          const witness: WitnessReading = {
            raw: rawVal,
            confidence: d.confidence ?? 0.99,
            witness: `Cloud Vision (${geminiModel})`,
          };
          setData({
            witnessA: witness,
            witnessB: witness,
            result: {
              consensus: rawVal,
              confidence: d.confidence ?? 0.99,
              status: "agree",
              diff: [],
              needsHumanReview: false,
            },
            extractedLines: lines,
            isMultiLine: lines.length > 1,
            deviceType: d.deviceType,
            glucoseValue: d.glucoseValue,
            glucoseUnit: d.glucoseUnit,
            timestamp: d.timestamp,
          });
        } else if (isAiActive && engineMode === "dual_hybrid") {
          const base64 = croppedCanvas.toDataURL("image/jpeg", 0.95);
          const { runDualLcdOcr } = await import("@/lib/meterOcr");

          const [localRes, aiRes] = await Promise.allSettled([
            runDualLcdOcr(croppedCanvas),
            fetch("/api/vision", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageBase64: base64, mode: "meter", apiKey, modelName: geminiModel }),
            }).then((r) => r.json()),
          ]);

          setCurrentStep(3);

          let witnessA: WitnessReading;
          let localLines: string[] = [];
          if (localRes.status === "fulfilled") {
            witnessA = { ...localRes.value.witnessA, witness: "Witness A (Local SSD)" };
            localLines = localRes.value.extractedLines || [];
          } else {
            witnessA = { raw: "—", confidence: 0, witness: "Witness A (Local SSD)" };
          }

          let witnessB: WitnessReading;
          let aiLines: string[] = [];
          let d: {
            deviceType?: "blood_pressure" | "glucose" | "utility_meter" | "general_meter";
            glucoseValue?: number | string;
            glucoseUnit?: string;
            timestamp?: string;
            lines?: string[];
            sys?: number;
            dia?: number;
            pulse?: number;
            value?: string;
            confidence?: number;
          } | null = null;

          if (aiRes.status === "fulfilled" && aiRes.value.success && aiRes.value.data) {
            d = aiRes.value.data;
            aiLines =
              d?.lines && d.lines.length > 0
                ? d.lines.map(String)
                : [d?.sys, d?.dia, d?.pulse].filter((v: unknown) => v !== null && v !== undefined).map(String);
            const rawVal = aiLines.length > 0 ? aiLines.join(" / ") : String(d?.value || "");
            witnessB = {
              raw: rawVal,
              confidence: d?.confidence ?? 0.98,
              witness: `Witness B (Cloud Vision ${geminiModel})`,
            };
          } else {
            const errText = aiRes.status === "fulfilled" ? aiRes.value.error : "Failed to call Cloud Vision";
            witnessB = { raw: `Error: ${errText}`, confidence: 0, witness: "Witness B (Cloud Vision)" };
          }

          const consensus = reconcileWitnesses(witnessA, witnessB);
          const finalLines = aiLines.length > 0 ? aiLines : localLines;

          // Crucial fix: When Witness A is empty / 0% confidence on photographic input, but Witness B succeeds
          const isWitnessAFailed =
            !witnessA.raw || witnessA.raw === "—" || witnessA.raw === "error" || witnessA.confidence === 0;

          if (isWitnessAFailed && witnessB.confidence > 0) {
            consensus.consensus = witnessB.raw;
            consensus.confidence = witnessB.confidence;
            consensus.status = "agree";
            consensus.needsHumanReview = witnessB.confidence < 0.8;
          } else if (witnessB.confidence > 0.8 && aiLines.length > 0) {
            consensus.consensus = aiLines.join(" / ");
            consensus.confidence = Math.max(consensus.confidence, witnessB.confidence);
          }

          setData({
            witnessA,
            witnessB,
            result: consensus,
            extractedLines: finalLines,
            isMultiLine: finalLines.length > 1,
            deviceType: d?.deviceType,
            glucoseValue: d?.glucoseValue,
            glucoseUnit: d?.glucoseUnit,
            timestamp: d?.timestamp,
          });
        } else {
          const { runDualLcdOcr } = await import("@/lib/meterOcr");
          const lcdResult = await runDualLcdOcr(croppedCanvas);
          setCurrentStep(3);

          setData({
            witnessA: lcdResult.witnessA,
            witnessB: lcdResult.witnessB,
            result: lcdResult.consensus,
            extractedLines: lcdResult.extractedLines,
            isMultiLine: lcdResult.isMultiLine,
          });
        }
      } else {
        if (!svgRef.current) throw new Error("No sample rendered yet.");
        setCurrentStep(2);
        const pixels = await getSvgPixels(svgRef.current);
        setCurrentStep(3);
        setData(runMeterWitnesses(pixels, "light-on-dark", false));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Source Selection Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>1. เลือกแหล่งข้อมูลมิเตอร์ดิจิตอล (Source Selection)</CardTitle>
              <CardDescription>
                เลือกภาพตัวอย่าง 7-Segment หรืออัปโหลดภาพถ่ายจากเครื่องวัดความดัน / เครื่องวัดน้ำตาล
              </CardDescription>
            </div>
            <Badge variant="outline" className="hidden sm:inline-flex">
              {uploadedFile ? "Custom Upload" : "Standard Sample"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Preset Buttons */}
          <div className="flex flex-wrap gap-2">
            {SAMPLE_METERS.map((meter) => (
              <Button
                key={meter.id}
                variant={!uploadedFile && selectedSampleId === meter.id ? "default" : "secondary"}
                size="sm"
                onClick={() => {
                  setSelectedSampleId(meter.id);
                  setUploadedFile(null);
                  setData(null);
                }}
              >
                {meter.label}
              </Button>
            ))}

            <label className="cursor-pointer">
              <span
                className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg h-8 px-3 text-xs font-medium transition-all ${
                  uploadedFile
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-xs"
                }`}
              >
                <Upload className="h-3.5 w-3.5" />
                <span>{uploadedFile ? "เปลี่ยนภาพที่อัปโหลด" : "อัปโหลดภาพของคุณเอง"}</span>
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setUploadedFile(f);
                  setData(null);
                  setError(null);
                }}
              />
            </label>
          </div>

          {/* Uploaded Controls Panel */}
          {uploadedFile && (
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-slate-900" />
                  <span className="text-xs sm:text-sm font-semibold text-slate-900">
                    LCD Alignment & Region of Interest (ROI)
                  </span>
                </div>
                <Button
                  variant={useCrop ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setUseCrop(!useCrop)}
                  className="h-7 text-xs self-start sm:self-auto"
                >
                  {useCrop ? "Crop Box: ON" : "Crop Box: OFF"}
                </Button>
              </div>

              {/* Presets */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-500 font-medium">อุปกรณ์ที่รองรับ:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-slate-300 bg-white text-slate-800 hover:border-black hover:bg-slate-50"
                    onClick={() => {
                      setCropBox({ top: 22, left: 24, width: 44, height: 42 });
                    }}
                  >
                    เครื่องวัดความดัน (Blood Pressure)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-slate-300 bg-white text-slate-800 hover:border-black hover:bg-slate-50"
                    onClick={() => {
                      setCropBox({ top: 18, left: 39, width: 23, height: 22 });
                    }}
                  >
                    เครื่องวัดน้ำตาล (Glucose)
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setCropBox({ top: 25, left: 25, width: 50, height: 50 });
                    }}
                  >
                    Center LCD
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setCropBox({ top: 0, left: 0, width: 100, height: 100 });
                    }}
                  >
                    เต็มรูป (Full)
                  </Button>
                </div>

                {/* Rotation Toolbar */}
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-2xs">
                  <span className="text-slate-500 font-medium flex items-center gap-1">
                    <RotateCw className="h-3.5 w-3.5" />
                    หมุนภาพ:
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
                  >
                    -90°
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                  >
                    +90°
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setRotation((r) => r - 5)}
                  >
                    -5°
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setRotation((r) => r + 5)}
                  >
                    +5°
                  </Button>
                  {rotation !== 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                      onClick={() => setRotation(0)}
                    >
                      Reset (0°)
                    </Button>
                  )}

                  <div className="flex items-center gap-2 ml-auto w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200">
                    <span className="text-slate-500">มุมเอียง ({rotation}°):</span>
                    <input
                      type="range"
                      min="-45"
                      max="45"
                      value={rotation}
                      onChange={(e) => setRotation(Number(e.target.value))}
                      className="accent-black w-24"
                    />
                  </div>
                </div>

                {/* Fine Region Sliders */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs text-slate-500">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Top</span>
                      <span className="font-mono text-slate-700 font-medium">{cropBox.top}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="90"
                      value={cropBox.top}
                      onChange={(e) => setCropBox({ ...cropBox, top: Number(e.target.value) })}
                      className="accent-black w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Left</span>
                      <span className="font-mono text-slate-700 font-medium">{cropBox.left}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="90"
                      value={cropBox.left}
                      onChange={(e) => setCropBox({ ...cropBox, left: Number(e.target.value) })}
                      className="accent-black w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Width</span>
                      <span className="font-mono text-slate-700 font-medium">{cropBox.width}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      value={cropBox.width}
                      onChange={(e) => setCropBox({ ...cropBox, width: Number(e.target.value) })}
                      className="accent-black w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Height</span>
                      <span className="font-mono text-slate-700 font-medium">{cropBox.height}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      value={cropBox.height}
                      onChange={(e) => setCropBox({ ...cropBox, height: Number(e.target.value) })}
                      className="accent-black w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Display Area */}
          <div className="flex flex-col lg:flex-row items-center justify-center gap-6 rounded-xl border border-slate-200/90 bg-slate-100/60 p-5 sm:p-6 overflow-hidden">
            {uploadedFile ? (
              <>
                {/* Drag-box selection canvas */}
                <div
                  ref={imageContainerRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  className="relative max-h-72 cursor-crosshair select-none overflow-hidden rounded-lg border border-slate-300 shadow-xs touch-none"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={URL.createObjectURL(uploadedFile)}
                    alt="Uploaded display"
                    className="max-h-72 rounded block pointer-events-none transition-transform duration-100"
                    style={{ transform: `rotate(${rotation}deg)` }}
                  />
                  {useCrop && (
                    <div
                      className="absolute pointer-events-none border-2 border-black bg-black/10 rounded shadow-xs"
                      style={{
                        top: `${cropBox.top}%`,
                        left: `${cropBox.left}%`,
                        width: `${cropBox.width}%`,
                        height: `${cropBox.height}%`,
                      }}
                    >
                      <span className="absolute -top-5 left-0 rounded bg-black px-1.5 py-0.5 text-[10px] font-mono text-white font-bold whitespace-nowrap shadow-xs">
                        LCD ROI
                      </span>
                    </div>
                  )}
                </div>

                {/* Cropped Zoom Preview */}
                {useCrop && (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center shadow-xs">
                    <span className="text-xs font-semibold text-slate-900">
                      ภาพที่จะส่งเข้าโมเดล (Cropped Region)
                    </span>
                    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-inner">
                      <canvas ref={previewCanvasRef} width={180} height={180} className="block rounded" />
                    </div>
                    <span className="text-[10px] text-slate-500 max-w-[200px] leading-relaxed">
                      คลิกลากบนรูปด้านซ้ายเพื่อเลือกเฉพาะหน้าปัดตัวเลขให้ชัดเจน
                    </span>
                  </div>
                )}
              </>
            ) : (
              <SevenSegmentDisplay ref={svgRef} meter={selectedSample} />
            )}
          </div>

          {/* API Key Required Banner */}
          {!apiKey && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex items-start gap-2.5 flex-1">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-amber-900">ต้องตั้งค่า Gemini API Key ก่อนวิเคราะห์รูปจริง</p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Local WASM Engine ทำงานได้เฉพาะกับภาพ SVG ตัวอย่างเท่านั้น สำหรับรูปถ่ายจริง (ความดัน, น้ำตาล, มิเตอร์)
                    ต้องใช้ Gemini Vision API เพื่อความแม่นยำสูง
                  </p>
                </div>
              </div>
              <Button variant="default" size="sm" onClick={onOpenSettings} className="shrink-0 gap-1.5 whitespace-nowrap">
                <KeyRound className="h-3.5 w-3.5" />
                ตั้งค่า API Key
              </Button>
            </div>
          )}

          {/* Action Button */}
          <Button
            variant="default"
            size="lg"
            onClick={handleAnalyze}
            disabled={loading || (Boolean(uploadedFile) && !apiKey)}
            className="w-full shadow-xs font-semibold"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                กำลังวิเคราะห์มิเตอร์ด้วย Dual-Witness Engine...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                {uploadedFile && !apiKey
                  ? "ต้องตั้งค่า API Key ก่อน"
                  : "วิเคราะห์ผลอ่านมิเตอร์ (Analyze Dual-Witness)"}
              </span>
            )}
          </Button>

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading State with Step Progress & Pulsing Skeleton */}
      {loading && (
        <Card className="border-slate-300 bg-white shadow-xs">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-slate-900 text-base">
                <Activity className="h-5 w-5 text-black animate-pulse" />
                ระบบกำลังประมวลผล (Real-time Processing Pipeline)
              </CardTitle>
              <Badge variant="default" className="animate-pulse">
                In Progress
              </Badge>
            </div>
            <CardDescription>
              ระบบกำลังดำเนินการวิเคราะห์ภาพตามขั้นตอนสถาปัตยกรรม Dual-Witness Consensus
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <StepProgress currentStep={currentStep} />

            <Separator />

            {/* Pulsing Skeleton Loaders */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
              </div>
              <Skeleton className="h-16 rounded-xl" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2. Result Presentation */}
      {data && !loading && (
        <div className="space-y-5">
          {/* Main Consensus Card */}
          <Card
            className={`border transition-all shadow-xs ${
              data.result.status === "agree"
                ? "border-emerald-200/90 bg-white"
                : data.result.status === "partial-agreement"
                ? "border-amber-200/90 bg-white"
                : "border-rose-200/90 bg-white"
            }`}
          >
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      data.result.status === "agree"
                        ? "emerald"
                        : data.result.status === "partial-agreement"
                        ? "amber"
                        : "destructive"
                    }
                    className="text-xs uppercase"
                  >
                    Consensus {data.result.status}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    ความมั่นใจ: {(data.result.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyMeterConsensus}
                    className="h-8 text-xs gap-1.5 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-xs"
                  >
                    {copiedResult ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedResult ? "คัดลอกผลอ่านแล้ว" : "คัดลอกผลอ่าน (Copy)"}</span>
                  </Button>
                  {data.result.needsHumanReview && (
                    <Badge variant="amber" className="gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Flagged for Human Review
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Primary Value Display */}
              <div className="relative group text-center py-4 rounded-xl bg-slate-50/80 border border-slate-200 shadow-2xs">
                <div className="text-xs text-slate-500 font-medium">ค่าฉันทามติที่วิเคราะห์ได้ (Consensus Reading)</div>
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mt-1 font-mono">
                  {data.result.consensus ?? "Unresolved"}
                </div>
                <button
                  onClick={copyMeterConsensus}
                  title="คัดลอกผลอ่าน"
                  className="absolute right-3 top-3 p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-all opacity-70 group-hover:opacity-100 shadow-xs"
                >
                  {copiedResult ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>

              {/* Medical Breakdown: Glucose vs Blood Pressure */}
              {(() => {
                // Check if glucose meter
                const isGlucoseDevice =
                  data.deviceType === "glucose" ||
                  Boolean(data.glucoseValue) ||
                  Boolean(data.extractedLines?.some((l) => /mg\/dl|mmol/i.test(l))) ||
                  Boolean(data.result.consensus && /mg\/dl|mmol/i.test(data.result.consensus));

                if (isGlucoseDevice) {
                  let gValNum = Number(data.glucoseValue);
                  if (isNaN(gValNum) && data.extractedLines) {
                    for (const line of data.extractedLines) {
                      const numMatch = line.match(/\b(\d{2,3})\b/);
                      if (numMatch && !line.includes(":")) {
                        gValNum = Number(numMatch[1]);
                        break;
                      }
                    }
                  }
                  if (isNaN(gValNum) && data.result.consensus) {
                    const numMatch = data.result.consensus.match(/\b(\d{2,3})\b/);
                    if (numMatch) gValNum = Number(numMatch[1]);
                  }

                  const gUnit =
                    data.glucoseUnit ||
                    data.extractedLines?.find((l) => /mg\/dl|mmol/i.test(l)) ||
                    "mg/dL";
                  const gTime =
                    data.timestamp ||
                    data.extractedLines?.find((l) => /am|pm|\d{1,2}:\d{2}/i.test(l)) ||
                    null;
                  const cat = !isNaN(gValNum) ? getGlucoseCategory(gValNum, gUnit) : null;

                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-300 bg-slate-50 p-5 text-center space-y-1">
                          <div className="text-xs text-slate-700 font-medium">
                            ระดับน้ำตาลในเลือด (Blood Glucose)
                          </div>
                          <div className="text-4xl sm:text-5xl font-black text-slate-950 font-mono tracking-tight">
                            {!isNaN(gValNum) ? gValNum : (data.result.consensus || "—")}
                          </div>
                          <div className="text-xs text-slate-700 font-bold uppercase">{gUnit}</div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-5 text-center space-y-2 flex flex-col justify-center shadow-xs">
                          <div className="text-xs text-slate-500 font-medium">วันเวลาที่บันทึก (Timestamp)</div>
                          <div className="text-xl sm:text-2xl font-bold text-slate-800 font-mono">
                            {gTime || "ไม่ระบุเวลา"}
                          </div>
                          <div className="text-[11px] text-slate-400">บันทึกอัตโนมัติจากหน้าปัดเครื่องวัด</div>
                        </div>
                      </div>

                      {cat && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-700 text-xs font-medium">
                              การแปลผลระดับน้ำตาล (ADA Guideline):
                            </span>
                            <Badge variant={cat.badgeVariant} className="text-xs">
                              {cat.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed pt-1">
                            {cat.desc}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                }

                // Check if blood pressure
                const isBloodPressure =
                  data.deviceType === "blood_pressure" ||
                  (data.extractedLines &&
                    data.extractedLines.length >= 2 &&
                    !isNaN(Number(data.extractedLines[0])) &&
                    !isNaN(Number(data.extractedLines[1])));

                if (isBloodPressure && data.extractedLines && data.extractedLines.length >= 2) {
                  const sys = Number(data.extractedLines[0]);
                  const dia = Number(data.extractedLines[1]);
                  const pulse = data.extractedLines[2] || "—";
                  const cat = !isNaN(sys) && !isNaN(dia) ? getBloodPressureCategory(sys, dia) : null;

                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center space-y-1 shadow-xs">
                          <div className="text-xs text-slate-500 font-medium">SYS (ความดันตัวบน)</div>
                          <div className="text-3xl font-black text-slate-900 font-mono">
                            {data.extractedLines[0] || "—"}
                          </div>
                          <div className="text-[11px] text-slate-400">mmHg</div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center space-y-1 shadow-xs">
                          <div className="text-xs text-slate-500 font-medium">DIA (ความดันตัวล่าง)</div>
                          <div className="text-3xl font-black text-slate-900 font-mono">
                            {data.extractedLines[1] || "—"}
                          </div>
                          <div className="text-[11px] text-slate-400">mmHg</div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center space-y-1 shadow-xs">
                          <div className="text-xs text-slate-500 font-medium">PULSE (ชีพจร)</div>
                          <div className="text-3xl font-black text-emerald-700 font-mono">
                            {pulse}
                          </div>
                          <div className="text-[11px] text-slate-400">bpm</div>
                        </div>
                      </div>

                      {cat && (
                        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-xs text-slate-700">
                          <span className="text-slate-600 font-medium">
                            เกณฑ์ระดับความดันโลหิต (AHA Guideline):
                          </span>
                          <Badge variant={cat.badgeVariant} className="text-xs">
                            {cat.label}
                          </Badge>
                        </div>
                      )}
                    </div>
                  );
                }

                return null;
              })()}

              {/* Dual Witness Comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-1 relative group">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-semibold text-slate-800">
                      {data.witnessA.witness || "Witness A"}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-500">{(data.witnessA.confidence * 100).toFixed(0)}%</span>
                      <button
                        onClick={() => copyWitness(data.witnessA.raw, "a")}
                        title="คัดลอกผล Witness A"
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                      >
                        {copiedWitnessA ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="text-lg font-mono font-bold text-slate-900">
                    {data.witnessA.raw || "—"}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-1 relative group">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-semibold text-slate-800">
                      {data.witnessB.witness || "Witness B"}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-500">{(data.witnessB.confidence * 100).toFixed(0)}%</span>
                      <button
                        onClick={() => copyWitness(data.witnessB.raw, "b")}
                        title="คัดลอกผล Witness B"
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                      >
                        {copiedWitnessB ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="text-lg font-mono font-bold text-slate-900">
                    {data.witnessB.raw || "—"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Slip or Document Detected Alert */}
          {data.isLikelyDocOrSlip && uploadedFile && (
            <Card className="border-amber-200 bg-amber-50/70 shadow-xs">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-amber-900">
                      ภาพนี้อาจเป็นสลิปโอนเงิน หรือเอกสารข้อความภาษาไทย
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      โหมด Meter reading ออกแบบมาเฉพาะสำหรับหน้าปัดดิจิตอล 7-segment แนะนำให้สลับไปที่โหมด
                      Document / Thai OCR เพื่อใช้ AI ถอดรหัสชื่อบัญชี จำนวนเงิน และเลขอ้างอิง
                    </p>
                  </div>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onSwitchToDocument(uploadedFile)}
                  className="gap-2"
                >
                  <span>สลับไปที่โหมด Document / Thai OCR ทันที</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Mode 2: General Document / UI OCR & Thai Intelligence                  */
/* ---------------------------------------------------------------------- */

interface DocumentAnalyzeResult {
  witnessA: TextWitnessResult;
  witnessB: TextWitnessResult;
  markdownA: string;
  markdownB: string;
  result: TextConsensusResult;
  intelligence?: DocumentIntelligenceResult;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function DocumentMode({
  initialFile,
  onFileConsumed,
  apiKey,
  engineMode,
  geminiModel,
  onOpenSettings,
}: {
  initialFile?: File | null;
  onFileConsumed?: () => void;
  apiKey: string;
  engineMode: EngineMode;
  geminiModel: string;
  onOpenSettings: () => void;
}) {
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DocumentAnalyzeResult | null>(null);
  const [activeView, setActiveView] = useState<"smart" | "formatted" | "plain_text" | "compare" | "json">("smart");
  const [copied, setCopied] = useState(false);
  const [copiedPlainText, setCopiedPlainText] = useState(false);
  const [copiedWitnessA, setCopiedWitnessA] = useState(false);
  const [copiedWitnessB, setCopiedWitnessB] = useState(false);

  // Sync if initialFile was passed
  const [prevInitialFile, setPrevInitialFile] = useState(initialFile);
  if (initialFile !== prevInitialFile) {
    setPrevInitialFile(initialFile);
    if (initialFile) {
      setFile(initialFile);
      onFileConsumed?.();
    }
  }

  async function handleAnalyze() {
    if (!file) return;
    setLoading(true);
    setCurrentStep(1);
    setError(null);
    setData(null);
    setProgress(null);

    try {
      const isAiActive = Boolean(apiKey);

      if (isAiActive && engineMode === "ai_only") {
        setCurrentStep(2);
        setProgress({ status: `Calling ${geminiModel} Vision Engine...`, progress: 0.5 });
        const base64 = await fileToBase64(file);
        const res = await fetch("/api/vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mode: "document", apiKey, modelName: geminiModel }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Cloud Vision error");

        setCurrentStep(3);
        const d = json.data;

        const { buildIntelligenceFromVision } = await import("@/lib/documentIntelligence");
        const intelligence = buildIntelligenceFromVision(d);
        const md = normalizeMarkdown(d.markdown || "");

        const witness: TextWitnessResult = {
          text: md,
          confidence: d.confidence ?? 0.99,
          witness: `Cloud Vision (${geminiModel})`,
        };

        setData({
          witnessA: witness,
          witnessB: witness,
          markdownA: md,
          markdownB: md,
          result: {
            consensus: md,
            similarity: 1,
            confidence: d.confidence ?? 0.99,
            status: "agree",
            needsHumanReview: false,
          },
          intelligence,
        });

        setActiveView(intelligence.docType !== "general_document" ? "smart" : "formatted");
      } else if (isAiActive && engineMode === "dual_hybrid") {
        setCurrentStep(2);
        setProgress({ status: `Running Dual-Witness: Local Tesseract + ${geminiModel}...`, progress: 0.2 });
        const base64Promise = fileToBase64(file);
        const { runDualTextOcr } = await import("@/lib/textOcr");

        const [localOcrRes, base64] = await Promise.all([
          runDualTextOcr(file, setProgress),
          base64Promise,
        ]);

        setCurrentStep(3);
        setProgress({ status: "Reconciling Witnesses with Vision Intelligence...", progress: 0.8 });

        const aiRes = await fetch("/api/vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mode: "document", apiKey, modelName: geminiModel }),
        }).then((r) => r.json());

        const wa: TextWitnessResult = {
          text: localOcrRes.witnessA.text,
          confidence: localOcrRes.witnessA.confidence,
          witness: "Witness A (Local Tesseract)",
        };

        let wb: TextWitnessResult;
        let markdownB = "";
        let aiIntelligence: DocumentIntelligenceResult | undefined;

        const { buildIntelligenceFromVision } = await import("@/lib/documentIntelligence");
        if (aiRes.success && aiRes.data) {
          const d = aiRes.data;
          markdownB = normalizeMarkdown(d.markdown || "");
          wb = {
            text: markdownB,
            confidence: d.confidence ?? 0.99,
            witness: `Witness B (Cloud Vision ${geminiModel})`,
          };
          aiIntelligence = buildIntelligenceFromVision(d);
        } else {
          wb = {
            text: `Cloud Vision Error: ${aiRes.error || "Unknown error"}`,
            confidence: 0,
            witness: "Witness B (Cloud Vision)",
          };
        }

        const { reconcileTextWitnesses } = await import("@/lib/textConsensus");
        const consensus = reconcileTextWitnesses(wa, wb);

        // Calculate semantic token overlap between Local Tesseract and Cloud Vision
        const waTokens = wa.text.replace(/[^\u0E00-\u0E7Fa-zA-Z0-9]/g, " ").split(/\s+/).filter((t) => t.length >= 3);
        const wbClean = wb.text.replace(/[^\u0E00-\u0E7Fa-zA-Z0-9]/g, " ");
        let matchCount = 0;
        for (const token of waTokens) {
          if (wbClean.includes(token)) matchCount++;
        }
        const tokenOverlap = waTokens.length > 0 ? matchCount / waTokens.length : 0;
        const isAgreed = tokenOverlap >= 0.25 || consensus.status === "agree" || wb.confidence >= 0.85;

        const effectiveConsensus: TextConsensusResult = {
          consensus: markdownB || wa.text,
          similarity: Math.max(consensus.similarity, tokenOverlap),
          confidence: isAgreed ? Math.max(wb.confidence, 0.95) : consensus.confidence,
          status: isAgreed ? "agree" : "disagreement",
          needsHumanReview: !isAgreed,
        };

        const { analyzeDocumentIntelligence } = await import("@/lib/documentIntelligence");
        const localIntelligence = analyzeDocumentIntelligence(
          localOcrRes.witnessA.text,
          localOcrRes.witnessA.lines
        );

        const finalIntelligence = aiIntelligence || localIntelligence;
        const mdA = normalizeMarkdown(linesToMarkdown(localOcrRes.witnessA.lines));

        setData({
          witnessA: wa,
          witnessB: wb,
          markdownA: mdA,
          markdownB: markdownB || normalizeMarkdown(linesToMarkdown(localOcrRes.witnessB.lines)),
          result: effectiveConsensus,
          intelligence: finalIntelligence,
        });

        setActiveView(finalIntelligence.docType !== "general_document" ? "smart" : "formatted");
      } else {
        setCurrentStep(2);
        const { runDualTextOcr } = await import("@/lib/textOcr");
        const { witnessA, witnessB } = await runDualTextOcr(file, setProgress);

        setCurrentStep(3);
        const wa: TextWitnessResult = { text: witnessA.text, confidence: witnessA.confidence, witness: "witness-a" };
        const wb: TextWitnessResult = { text: witnessB.text, confidence: witnessB.confidence, witness: "witness-b" };

        const { analyzeDocumentIntelligence } = await import("@/lib/documentIntelligence");
        const bestLines = witnessA.lines.length >= witnessB.lines.length ? witnessA.lines : witnessB.lines;
        const bestText = witnessA.confidence >= witnessB.confidence ? witnessA.text : witnessB.text;
        const intelligence = analyzeDocumentIntelligence(bestText, bestLines);

        setData({
          witnessA: wa,
          witnessB: wb,
          markdownA: linesToMarkdown(witnessA.lines),
          markdownB: linesToMarkdown(witnessB.lines),
          result: reconcileTextWitnesses(wa, wb),
          intelligence,
        });

        if (intelligence.docType !== "general_document") {
          setActiveView("smart");
        } else {
          setActiveView("formatted");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  function copyToClipboard(text: string, which?: "general" | "plain" | "wa" | "wb") {
    navigator.clipboard.writeText(text);
    if (which === "plain") {
      setCopiedPlainText(true);
      setTimeout(() => setCopiedPlainText(false), 2000);
    } else if (which === "wa") {
      setCopiedWitnessA(true);
      setTimeout(() => setCopiedWitnessA(false), 2000);
    } else if (which === "wb") {
      setCopiedWitnessB(true);
      setTimeout(() => setCopiedWitnessB(false), 2000);
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function downloadMarkdown(text: string) {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ocr-output.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  const resolvedMarkdown =
    data?.markdownB || data?.markdownA || data?.result.consensus || "";

  function loadSampleDocument(type: "slip" | "receipt") {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 700;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (type === "slip") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 600, 700);
      ctx.fillStyle = "#4e2a84";
      ctx.fillRect(0, 0, 600, 80);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText("SCB EASY - โอนเงินสำเร็จ", 30, 50);

      ctx.fillStyle = "#1e293b";
      ctx.font = "16px sans-serif";
      ctx.fillText("วันที่ 31 ส.ค. 2569 - 18:13", 30, 120);
      ctx.fillText("รหัสอ้างอิง: 202608311813459201", 30, 150);

      ctx.strokeStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.moveTo(30, 180);
      ctx.lineTo(570, 180);
      ctx.stroke();

      ctx.fillStyle = "#64748b";
      ctx.fillText("จาก (ผู้โอน):", 30, 220);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 18px sans-serif";
      ctx.fillText("นาง มยุรี วงศ์สุริยา", 30, 250);
      ctx.font = "16px sans-serif";
      ctx.fillText("เลขบัญชี: xxx-xxx720-0", 30, 280);

      ctx.fillStyle = "#64748b";
      ctx.fillText("ไปยัง (ผู้รับเงิน):", 30, 330);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 18px sans-serif";
      ctx.fillText("นาย เมธี เกินบุรินทร์", 30, 360);
      ctx.font = "16px sans-serif";
      ctx.fillText("เลขบัญชี: xxx-xxx030-5", 30, 390);

      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(30, 430, 540, 100);
      ctx.fillStyle = "#64748b";
      ctx.font = "16px sans-serif";
      ctx.fillText("จำนวนเงินโอน", 50, 465);
      ctx.fillStyle = "#4e2a84";
      ctx.font = "bold 32px sans-serif";
      ctx.fillText("12,000.00 บาท", 50, 505);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px sans-serif";
      ctx.fillText("ค่าธรรมเนียม: 0.00 บาท", 50, 570);
      ctx.fillText("ผู้รับเงินสามารถสแกน QR Code นี้เพื่อตรวจสอบสถานะการโอนเงิน", 50, 610);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 600, 700);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText("ร้านค้าสะดวกซื้อ 7-Eleven", 30, 50);
      ctx.font = "16px sans-serif";
      ctx.fillText("เลขประจำตัวผู้เสียภาษี (Tax ID): 0107542000011", 30, 85);
      ctx.fillText("ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ", 30, 115);
      ctx.fillText("วันที่ 31/08/2569 เวลา 14:20 น.", 30, 145);

      ctx.strokeStyle = "#cbd5e1";
      ctx.beginPath();
      ctx.moveTo(30, 170);
      ctx.lineTo(570, 170);
      ctx.stroke();

      ctx.font = "16px sans-serif";
      ctx.fillText("1. กาแฟเย็น ออลคาเฟ่", 30, 230);
      ctx.fillText("45.00 บาท", 450, 230);

      ctx.fillText("2. ขนมปังแซนด์วิชแฮมชีส", 30, 270);
      ctx.fillText("32.00 บาท", 450, 270);

      ctx.fillText("3. น้ำดื่ม 600 มล.", 30, 310);
      ctx.fillText("7.00 บาท", 450, 310);

      ctx.beginPath();
      ctx.moveTo(30, 350);
      ctx.lineTo(570, 350);
      ctx.stroke();

      ctx.font = "bold 18px sans-serif";
      ctx.fillText("ยอดรวมสุทธิ (Total)", 30, 390);
      ctx.fillText("84.00 บาท", 450, 390);

      ctx.font = "16px sans-serif";
      ctx.fillText("ภาษีมูลค่าเพิ่ม (VAT 7%): 5.50 บาท", 30, 430);
      ctx.fillText("ขอบคุณที่ใช้บริการ", 30, 480);
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const sampleFile = new File([blob], type === "slip" ? "sample-scb-slip.png" : "sample-receipt.png", {
        type: "image/png",
      });
      setFile(sampleFile);
      setData(null);
      setError(null);
    }, "image/png");
  }

  return (
    <div className="space-y-6">
      {/* 1. Document Upload Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>1. อัปโหลดเอกสาร / สลิปโอนเงิน / ใบเสร็จ</CardTitle>
              <CardDescription>
                รองรับไฟล์ PNG, JPG, WEBP และเอกสารข้อความภาษาไทยพร้อมระบบตัดสระลอยอัตโนมัติ
              </CardDescription>
            </div>
            <div className="flex items-center gap-1.5 self-start sm:self-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadSampleDocument("slip")}
                className="h-7 text-xs border-slate-200 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 shadow-xs"
              >
                ลองสลิปตัวอย่าง
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadSampleDocument("receipt")}
                className="h-7 text-xs border-slate-200 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 shadow-xs"
              >
                ลองใบเสร็จตัวอย่าง
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-6 sm:p-8 text-center transition hover:border-slate-400 hover:bg-slate-100/50">
            <label className="flex flex-col items-center gap-3 cursor-pointer w-full">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-700 shadow-xs">
                <Upload className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-800">
                  {file ? file.name : "คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่"}
                </p>
                <p className="text-xs text-slate-500">
                  {file ? `${(file.size / 1024).toFixed(1)} KB` : "PNG, JPG, WEBP ขนาดไม่เกิน 15MB"}
                </p>
              </div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setData(null);
                  setError(null);
                }}
              />
            </label>
          </div>

          {file && (
            <div className="flex justify-center rounded-xl border border-slate-200 bg-slate-100/50 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(file)} alt="Uploaded document" className="max-h-72 rounded-lg object-contain" />
            </div>
          )}

          {/* API Key Banner */}
          {!apiKey && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex items-start gap-2.5 flex-1">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-amber-900">
                    {engineMode === "ai_only"
                      ? "ต้องระบุ Gemini API Key สำหรับโหมด Cloud Vision"
                      : "แนะนำ: ตั้งค่า Gemini API Key เพื่อผลลัพธ์ที่แม่นยำสูงสุด"}
                  </p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {engineMode === "ai_only"
                      ? "โหมด Cloud Vision (AI-Only) ต้องการ Gemini API Key เพื่อวิเคราะห์ภาพเอกสาร"
                      : "หากไม่ระบุ API Key ระบบจะใช้ Local Tesseract ในเครื่อง (ความแม่นยำอาจลดลงสำหรับสลิป/ฟอนต์พิเศษ) แนะนำให้ตั้งค่า Gemini API Key เพื่อผลลัพธ์โครงสร้าง Markdown ที่สมบูรณ์แบบ"}
                  </p>
                </div>
              </div>
              <Button variant="default" size="sm" onClick={onOpenSettings} className="shrink-0 gap-1.5 whitespace-nowrap">
                <KeyRound className="h-3.5 w-3.5" />
                ตั้งค่า API Key
              </Button>
            </div>
          )}

          <Button
            variant="default"
            size="lg"
            onClick={handleAnalyze}
            disabled={loading || !file || (!apiKey && engineMode === "ai_only")}
            className="w-full shadow-xs font-semibold"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                {progress?.status ?? "กำลังวิเคราะห์เอกสารด้วย Dual-Witness..."}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {!apiKey && engineMode === "ai_only"
                  ? "ต้องตั้งค่า API Key ก่อนวิเคราะห์"
                  : "วิเคราะห์เอกสาร (Analyze Document)"}
              </span>
            )}
          </Button>

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading State with Step Progress & Pulsing Skeleton */}
      {loading && (
        <Card className="border-slate-300 bg-white shadow-xs">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-slate-900 text-base">
                <Activity className="h-5 w-5 text-black animate-pulse" />
                กำลังประมวลผลข้อความและโครงสร้างเอกสาร
              </CardTitle>
              <Badge variant="default" className="animate-pulse">
                {progress ? `${Math.round(progress.progress * 100)}%` : "Working"}
              </Badge>
            </div>
            <CardDescription>
              {progress?.status || "กำลังตรวจสอบฉันทามติภาษาไทยด้วย Dual-Witness Engine"}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <StepProgress currentStep={currentStep} />

            {/* Realtime progress bar */}
            {progress && (
              <div className="space-y-1.5">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-black transition-all duration-300 rounded-full"
                    style={{ width: `${Math.round(progress.progress * 100)}%` }}
                  />
                </div>
              </div>
            )}

            <Separator />

            {/* Pulsing Skeleton Loaders */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-24" />
              </div>
              <Skeleton className="h-32 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2. Results Presentation */}
      {data && !loading && (
        <div className="space-y-5">
          {/* Witness Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1 relative group shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold text-slate-800">Witness A (Local Tesseract)</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-500">{(data.witnessA.confidence * 100).toFixed(0)}%</span>
                  <button
                    onClick={() => copyToClipboard(data.witnessA.text, "wa")}
                    title="คัดลอกข้อความ Witness A"
                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    {copiedWitnessA ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <p className="line-clamp-2 text-xs sm:text-sm text-slate-700">
                {data.witnessA.text.trim() || "—"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1 relative group shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold text-slate-800">Witness B ({data.witnessB.witness || "AI / Vision"})</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-500">{(data.witnessB.confidence * 100).toFixed(0)}%</span>
                  <button
                    onClick={() => copyToClipboard(data.witnessB.text, "wb")}
                    title="คัดลอกข้อความ Witness B"
                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    {copiedWitnessB ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <p className="line-clamp-2 text-xs sm:text-sm text-slate-700">
                {data.witnessB.text.trim() || "—"}
              </p>
            </div>
          </div>

          {/* Consensus Status Card */}
          <Card
            className={`border transition-all shadow-xs ${
              data.result.status === "agree"
                ? "border-emerald-200 bg-white"
                : "border-amber-200 bg-white"
            }`}
          >
            <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={data.result.status === "agree" ? "emerald" : "amber"}
                    className="text-xs uppercase"
                  >
                    Consensus {data.result.status}
                  </Badge>
                  {data.intelligence && (
                    <Badge variant="secondary" className="text-xs">
                      {data.intelligence.typeNameTh}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  ความคล้ายคลึง: {(data.result.similarity * 100).toFixed(0)}% · ความมั่นใจ:{" "}
                  {(data.result.confidence * 100).toFixed(0)}%
                  {data.result.needsHumanReview && " — แนะนำให้ตรวจสอบจุดคลาดเคลื่อน"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(markdownToPlainText(resolvedMarkdown), "plain")}
                  className="h-8 text-xs gap-1.5 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-xs"
                >
                  {copiedPlainText ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedPlainText ? "คัดลอกข้อความแล้ว" : "คัดลอกข้อความ (Plain Text)"}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(resolvedMarkdown, "general")}
                  className="h-8 text-xs gap-1.5 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-xs"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? "คัดลอก MD แล้ว" : "คัดลอก Markdown"}</span>
                </Button>
                {resolvedMarkdown && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => downloadMarkdown(resolvedMarkdown)}
                    className="h-8 text-xs gap-1.5 shadow-xs"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Download .md</span>
                    <span className="sm:hidden">.md</span>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Views Toolbar & Content */}
          <Card className="shadow-xs">
            <CardHeader className="border-b border-slate-200/90 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveView("smart")}
                    className={`h-7 text-xs gap-1 transition-all ${
                      activeView === "smart"
                        ? "bg-white text-slate-900 shadow-xs border border-slate-200/90 font-medium"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Structured Card
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveView("formatted")}
                    className={`h-7 text-xs gap-1 transition-all ${
                      activeView === "formatted"
                        ? "bg-white text-slate-900 shadow-xs border border-slate-200/90 font-medium"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Markdown Document
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveView("plain_text")}
                    className={`h-7 text-xs gap-1 transition-all ${
                      activeView === "plain_text"
                        ? "bg-white text-slate-900 shadow-xs border border-slate-200/90 font-medium"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5 text-slate-700" />
                    ข้อความจัดหน้าสวยงาม (Plain Text)
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveView("compare")}
                    className={`h-7 text-xs gap-1 transition-all ${
                      activeView === "compare"
                        ? "bg-white text-slate-900 shadow-xs border border-slate-200/90 font-medium"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    เปรียบเทียบพยาน (Compare)
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveView("json")}
                    className={`h-7 text-xs transition-all ${
                      activeView === "json"
                        ? "bg-white text-slate-900 shadow-xs border border-slate-200/90 font-medium"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                    }`}
                  >
                    Raw JSON
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-5 sm:p-6">
              {activeView === "smart" && (
                <div className="space-y-5">
                  {data.intelligence?.bankSlip && (
                    <SmartSlipCard
                      slip={data.intelligence.bankSlip}
                      typeName={data.intelligence.typeNameTh}
                    />
                  )}
                  {data.intelligence?.receipt && (
                    <SmartReceiptCard
                      receipt={data.intelligence.receipt}
                      typeName={data.intelligence.typeNameTh}
                    />
                  )}
                  {data.intelligence?.docType === "general_document" && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-700 space-y-2">
                      <span className="font-semibold text-slate-900">ข้อมูลการวิเคราะห์เอกสาร:</span>
                      <ul className="list-disc list-inside space-y-1 text-slate-600">
                        {data.intelligence.keyInsights.map((insight, idx) => (
                          <li key={idx}>{insight}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <RenderedMarkdownViewer markdown={resolvedMarkdown} title="เอกสารฉบับเต็ม (Full Extracted Document)" />
                </div>
              )}

              {activeView === "formatted" && (
                <RenderedMarkdownViewer markdown={resolvedMarkdown} title="เอกสารจัดรูปแบบ (Structured Markdown)" />
              )}

              {activeView === "plain_text" && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                    <span className="text-xs text-slate-500 font-medium">
                      ข้อความธรรมดาจัดรูปแบบเรียบร้อย (พร้อมส่งต่อ LINE / บันทึกย่อ):
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(markdownToPlainText(resolvedMarkdown), "plain")}
                      className="h-7 text-xs gap-1.5 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-xs"
                    >
                      {copiedPlainText ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedPlainText ? "คัดลอกข้อความแล้ว" : "คัดลอกข้อความทั้งหมด (Copy All)"}</span>
                    </Button>
                  </div>
                  <pre className="w-full whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50/80 p-5 font-mono text-xs sm:text-sm text-slate-800 leading-relaxed overflow-x-auto shadow-2xs select-text">
                    {markdownToPlainText(resolvedMarkdown)}
                  </pre>
                </div>
              )}

              {activeView === "compare" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>เปรียบเทียบผลอ่านระหว่าง Local Tesseract และ Cloud Vision (AI)</span>
                    <Badge variant={data.result.status === "agree" ? "emerald" : "amber"}>
                      Similarity: {(data.result.similarity * 100).toFixed(0)}%
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800">Witness A (Local Tesseract):</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(data.witnessA.text, "wa")}
                          className="h-6 text-[11px] gap-1 px-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                        >
                          {copiedWitnessA ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          <span>{copiedWitnessA ? "คัดลอกแล้ว" : "Copy Witness A"}</span>
                        </Button>
                      </div>
                      <RenderedMarkdownViewer markdown={data.markdownA} title="Witness A Markdown" />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800">Witness B (Cloud Vision / AI):</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(data.witnessB.text, "wb")}
                          className="h-6 text-[11px] gap-1 px-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                        >
                          {copiedWitnessB ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          <span>{copiedWitnessB ? "คัดลอกแล้ว" : "Copy Witness B"}</span>
                        </Button>
                      </div>
                      <RenderedMarkdownViewer markdown={data.markdownB} title="Witness B Markdown" />
                    </div>
                  </div>
                </div>
              )}

              {activeView === "json" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <span className="text-xs text-slate-500 font-medium">โครงสร้างข้อมูล JSON (Document Intelligence):</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(JSON.stringify(data.intelligence, null, 2), "general")}
                      className="h-7 text-xs gap-1.5 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-xs"
                    >
                      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      <span>{copied ? "คัดลอก JSON แล้ว" : "คัดลอก JSON (Copy)"}</span>
                    </Button>
                  </div>
                  <textarea
                    readOnly
                    value={JSON.stringify(data.intelligence, null, 2)}
                    rows={14}
                    className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/80 p-4 font-mono text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-300"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Smart Entities Cards: Bank Slip & Receipt                              */
/* ---------------------------------------------------------------------- */

function SmartSlipCard({ slip, typeName }: { slip: BankSlipData; typeName: string }) {
  const bank = slip.bank;
  return (
    <div
      className={`rounded-2xl border p-5 sm:p-6 shadow-xs space-y-5 bg-white ${
        bank?.borderColor || "border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-3.5 h-3.5 rounded-full ring-2 ring-white shadow-xs"
            style={{ backgroundColor: bank?.brandColor || "#4f46e5" }}
          />
          <span className="text-sm sm:text-base font-bold tracking-tight text-slate-900">
            {bank?.name || typeName}
          </span>
        </div>
        {slip.isSuccessful && (
          <Badge variant="emerald" className="gap-1 font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5" />
            โอนเงินสำเร็จ
          </Badge>
        )}
      </div>

      {slip.amountFormatted && (
        <div className="text-center py-4 bg-slate-50/90 rounded-xl border border-slate-200/80">
          <div className="text-xs text-slate-500 font-medium">จำนวนเงินโอน</div>
          <div className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight mt-1 font-mono">
            {slip.amountFormatted}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50/70 rounded-xl p-4 border border-slate-200/80 text-xs">
        <div className="space-y-1">
          <span className="text-slate-500 font-medium">จาก (ผู้โอน):</span>
          <div className="font-semibold text-slate-900">{slip.senderName || "—"}</div>
          {slip.senderAccount && <div className="font-mono text-slate-500">{slip.senderAccount}</div>}
        </div>
        <div className="space-y-1 sm:border-l sm:border-slate-200 sm:pl-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200">
          <span className="text-slate-500 font-medium">ไปยัง (ผู้รับเงิน):</span>
          <div className="font-semibold text-slate-900">{slip.receiverName || "—"}</div>
          {slip.receiverAccount && <div className="font-mono text-slate-500">{slip.receiverAccount}</div>}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-1 gap-2">
        {slip.dateTime && (
          <span>
            วันเวลา: <strong className="text-slate-800 font-semibold">{slip.dateTime}</strong>
          </span>
        )}
        {slip.referenceNo && (
          <span>
            เลขอ้างอิง: <strong className="font-mono text-slate-700">{slip.referenceNo}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

function SmartReceiptCard({ receipt, typeName }: { receipt: ReceiptData; typeName: string }) {
  return (
    <div className="rounded-2xl border border-amber-200/90 bg-white p-5 sm:p-6 shadow-xs space-y-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <span className="text-sm sm:text-base font-bold text-slate-900">
          {receipt.merchantName || typeName}
        </span>
        {receipt.taxId && (
          <Badge variant="secondary" className="font-mono text-[11px]">
            Tax ID: {receipt.taxId}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-center">
        {receipt.totalFormatted && (
          <div className="bg-amber-50/60 rounded-xl p-4 border border-amber-200/80">
            <div className="text-xs text-amber-800 font-medium">ยอดรวมสุทธิ (Total)</div>
            <div className="text-2xl sm:text-3xl font-black text-amber-950 mt-1 font-mono">
              {receipt.totalFormatted}
            </div>
          </div>
        )}
        {receipt.vatFormatted && (
          <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200/80">
            <div className="text-xs text-slate-500 font-medium">ภาษีมูลค่าเพิ่ม (VAT 7%)</div>
            <div className="text-2xl sm:text-3xl font-black text-slate-800 mt-1 font-mono">
              {receipt.vatFormatted}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Formatted Markdown Viewer Component                                    */
/* ---------------------------------------------------------------------- */

function renderInlineFormatting(text: string) {
  // Parse bold (**...**), italic (*...*), and code (`...`)
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-bold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={i} className="italic text-slate-800">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-900 border border-slate-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function RenderedMarkdownViewer({
  markdown,
  title = "เอกสารจัดรูปแบบ (Structured Markdown)",
}: {
  markdown: string;
  title?: string;
}) {
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedPlain, setCopiedPlain] = useState(false);

  if (!markdown || !markdown.trim()) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
        (ไม่มีข้อความที่ตรวจพบ / No text detected)
      </div>
    );
  }

  const cleanMd = normalizeMarkdown(markdown);
  const plainText = markdownToPlainText(cleanMd);
  const chunks = cleanMd.split("\n\n");

  function copyMarkdown() {
    navigator.clipboard.writeText(cleanMd);
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 2000);
  }

  function copyPlainText() {
    navigator.clipboard.writeText(plainText);
    setCopiedPlain(true);
    setTimeout(() => setCopiedPlain(false), 2000);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
      {/* Viewer Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-slate-700" />
          <span className="font-semibold text-slate-800">{title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={copyMarkdown}
            className="h-7 text-[11px] gap-1 px-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
          >
            {copiedMd ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            <span>{copiedMd ? "คัดลอก MD แล้ว" : "คัดลอก Markdown"}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyPlainText}
            className="h-7 text-[11px] gap-1 px-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
          >
            {copiedPlain ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            <span>{copiedPlain ? "คัดลอกข้อความแล้ว" : "คัดลอก Plain Text"}</span>
          </Button>
        </div>
      </div>

      <div className="p-5 sm:p-6 text-xs sm:text-sm text-slate-700 space-y-3.5 leading-relaxed">
        {chunks.map((chunk, idx) => {
          const trimmed = chunk.trim();
          if (!trimmed) return null;

          if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
            return <Separator key={idx} className="my-2.5 bg-slate-200" />;
          }

          if (trimmed.startsWith("# ")) {
            return (
              <h1
                key={idx}
                className="text-base sm:text-lg font-bold text-slate-900 tracking-tight border-b border-slate-200 pb-2 pt-1"
              >
                {renderInlineFormatting(trimmed.replace(/^#\s+/, ""))}
              </h1>
            );
          }

          if (trimmed.startsWith("## ")) {
            return (
              <h2
                key={idx}
                className="text-sm sm:text-base font-semibold text-slate-800 border-b border-slate-100 pb-1.5 pt-1"
              >
                {renderInlineFormatting(trimmed.replace(/^##\s+/, ""))}
              </h2>
            );
          }

          if (trimmed.startsWith("### ")) {
            return (
              <h3 key={idx} className="text-xs sm:text-sm font-semibold text-slate-800 pt-1">
                {renderInlineFormatting(trimmed.replace(/^###\s+/, ""))}
              </h3>
            );
          }

          // Blockquotes / executive callouts
          if (trimmed.startsWith("> ")) {
            const quoteText = trimmed.replace(/^>\s*/, "");
            return (
              <div
                key={idx}
                className="rounded-xl border-l-4 border-black bg-slate-100/90 px-4 py-2.5 text-xs sm:text-sm text-slate-900 font-medium shadow-2xs"
              >
                {renderInlineFormatting(quoteText)}
              </div>
            );
          }

          // Markdown Table rendering
          if (trimmed.startsWith("|")) {
            const tableLines = trimmed.split("\n").filter((l) => l.trim().length > 0);
            if (tableLines.length >= 2) {
              const headers = tableLines[0].split("|").slice(1, -1).map((c) => c.trim());
              const rows = tableLines.slice(2).map((rowStr) =>
                rowStr.split("|").slice(1, -1).map((c) => c.trim())
              );
              return (
                <div key={idx} className="overflow-x-auto rounded-xl border border-slate-200 my-3 shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        {headers.map((h, hIdx) => (
                          <th key={hIdx} className="p-3 font-semibold border-b border-slate-200">
                            {renderInlineFormatting(h)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50/60 transition-colors">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="p-3 text-slate-700">
                              {renderInlineFormatting(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }
          }

          // Bullet list and Key-Value groups
          if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.includes("\n- ") || trimmed.includes("\n* ")) {
            const sublines = trimmed.split("\n").filter((l) => l.trim().length > 0);
            return (
              <div key={idx} className="space-y-1.5 my-1">
                {sublines.map((sLine, sIdx) => {
                  const sTrimmed = sLine.trim();
                  const itemText = sTrimmed.replace(/^[-*]\s+/, "");
                  const kvMatch = itemText.match(/^\*\*([^*]+)\*\*:\s*(.+)$/);
                  if (kvMatch) {
                    return (
                      <div
                        key={sIdx}
                        className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-1.5 border-b border-slate-100 text-xs sm:text-sm gap-0.5"
                      >
                        <span className="text-slate-500 font-medium">{kvMatch[1]}:</span>
                        <span className="text-slate-900 font-semibold sm:text-right sm:pl-3">
                          {renderInlineFormatting(kvMatch[2])}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div key={sIdx} className="flex items-start gap-2 text-slate-700 text-xs sm:text-sm">
                      <span className="text-black mt-0.5 select-none">•</span>
                      <span>{renderInlineFormatting(itemText)}</span>
                    </div>
                  );
                })}
              </div>
            );
          }

          return (
            <p key={idx} className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              {renderInlineFormatting(trimmed)}
            </p>
          );
        })}
      </div>
    </div>
  );
}
