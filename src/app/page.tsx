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

  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [tempKey, setTempKey] = useState<string>("");
  const [tempEngineMode, setTempEngineMode] = useState<EngineMode>("dual_hybrid");

  function openSettings() {
    setTempKey(apiKey);
    setTempEngineMode(engineMode);
    setShowKeyModal(true);
  }

  function handleSaveKey() {
    const trimmedKey = tempKey.trim();
    setApiKey(trimmedKey);
    setEngineMode(tempEngineMode);
    if (typeof window !== "undefined") {
      localStorage.setItem("ocr_gemini_api_key", trimmedKey);
      localStorage.setItem("ocr_engine_mode", tempEngineMode);
    }
    setShowKeyModal(false);
  }

  function handleSwitchToDocument(file: File) {
    setStagedDocumentFile(file);
    setMode("document");
  }

  const isAiActive = Boolean(apiKey) && engineMode !== "local_only";

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100 antialiased">
      {/* Modern Enterprise Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-md shadow-indigo-600/30 ring-1 ring-white/20">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm sm:text-base tracking-tight text-white whitespace-nowrap">
                  OCR Dual-Witness
                </span>
                <Badge variant="indigo" className="hidden sm:inline-flex text-[10px] font-mono py-0 h-4">
                  Enterprise
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400 hidden xs:block">
                Consensus Verification Pipeline
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="h9"
              onClick={openSettings}
              className="group border-slate-700/80 bg-slate-900/90 hover:border-indigo-500/60"
            >
              <KeyRound className="h-4 w-4 text-slate-400 group-hover:text-indigo-400 transition-colors" />
              <span className="hidden sm:inline">Engine Settings</span>
              <span className="sm:hidden">Settings</span>
              {isAiActive ? (
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/80" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-slate-500" />
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
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
                Dual-Witness Consensus Engine
                <Badge variant="emerald" className="text-xs font-normal">
                  v2.0
                </Badge>
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-slate-400 max-w-3xl leading-relaxed">
                ระบบตรวจสอบเอกสารและมิเตอร์ดิจิตอลสองชั้น (Dual-Witness) โดยตรวจสอบความสอดคล้องของผลลัพธ์
                หากผลอ่านตรงกันจะยกระดับความมั่นใจ พร้อมตรวจจับจุดคลาดเคลื่อนเพื่อความถูกต้องสูงสุด
              </p>
            </div>
          </div>

          {/* Engine Status Card */}
          <Card className="border-slate-800/90 bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-slate-950/80 p-0 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3">
              <div className="flex items-start sm:items-center gap-3">
                <div
                  className={`mt-0.5 sm:mt-0 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                    isAiActive
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-slate-700 bg-slate-800 text-slate-400"
                  }`}
                >
                  {isAiActive ? <Sparkles className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs sm:text-sm font-semibold text-slate-100">
                      {engineMode === "dual_hybrid" && apiKey
                        ? "Dual-Witness Hybrid Active"
                        : engineMode === "ai_only" && apiKey
                        ? "Cloud Vision Direct Active"
                        : "Local Offline Engine (WASM)"}
                    </span>
                    <Badge variant={isAiActive ? "emerald" : "secondary"} className="text-[10px] py-0 h-4">
                      {isAiActive ? "Cloud Assisted" : "100% On-Device"}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400">
                    {engineMode === "dual_hybrid" && apiKey ? (
                      <>Witness A (Local Model) + Witness B (Gemini 2.5 Flash Lite) ตรวจสอบสองชั้น</>
                    ) : engineMode === "ai_only" && apiKey ? (
                      <>ประมวลผลด้วย Gemini 2.5 Flash Lite Vision Model ความแม่นยำสูง</>
                    ) : (
                      <>ทำงานภายในเบราว์เซอร์ 100% ไม่มีส่งข้อมูลออกภายนอก (Privacy-Preserving)</>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openSettings}
                  className="h-8 text-xs border-slate-700/80 text-indigo-300 hover:text-indigo-200 hover:border-indigo-500/50"
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
            <div className="flex border-b border-slate-800/80 pb-px">
              <TabsList className="bg-slate-900/60 p-1 border border-slate-800">
                <TabsTrigger value="meter" className="gap-2 px-4 py-2">
                  <Gauge className="h-4 w-4" />
                  <span>Meter Reading (7-Segment & LCD)</span>
                </TabsTrigger>
                <TabsTrigger value="document" className="gap-2 px-4 py-2">
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
              />
            </TabsContent>

            <TabsContent value="document">
              <DocumentMode
                initialFile={stagedDocumentFile}
                onFileConsumed={() => setStagedDocumentFile(null)}
                apiKey={apiKey}
                engineMode={engineMode}
              />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Settings Dialog */}
      <Dialog open={showKeyModal} onOpenChange={setShowKeyModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-100">
              <Sliders className="h-5 w-5 text-indigo-400" />
              การตั้งค่า OCR Engine & Cloud Witness
            </DialogTitle>
            <DialogDescription>
              เลือกสถาปัตยกรรมประมวลผล และระบุ Gemini API Key เพื่อเปิดใช้งาน Dual-Witness AI Engine
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-200">
                รูปแบบการประมวลผล (Engine Architecture):
              </label>
              <div className="space-y-2">
                {/* Option 1: Dual Hybrid */}
                <div
                  onClick={() => setTempEngineMode("dual_hybrid")}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all ${
                    tempEngineMode === "dual_hybrid"
                      ? "border-indigo-500/80 bg-indigo-950/30 text-indigo-200 ring-1 ring-indigo-500/40"
                      : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="engineMode"
                    checked={tempEngineMode === "dual_hybrid"}
                    onChange={() => setTempEngineMode("dual_hybrid")}
                    className="mt-1 accent-indigo-500 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs sm:text-sm text-slate-100">
                        Dual-Witness Hybrid (แนะนำ)
                      </span>
                      <Badge variant="indigo" className="text-[10px] py-0 h-4">
                        Consensus
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      รวมพลัง Local Model เป็น Witness A และ Gemini 2.5 Flash Lite เป็น Witness B ตรวจสอบสองชั้น
                    </p>
                  </div>
                </div>

                {/* Option 2: AI Only */}
                <div
                  onClick={() => setTempEngineMode("ai_only")}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all ${
                    tempEngineMode === "ai_only"
                      ? "border-indigo-500/80 bg-indigo-950/30 text-indigo-200 ring-1 ring-indigo-500/40"
                      : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="engineMode"
                    checked={tempEngineMode === "ai_only"}
                    onChange={() => setTempEngineMode("ai_only")}
                    className="mt-1 accent-indigo-500 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <span className="font-bold text-xs sm:text-sm text-slate-100">
                      Cloud Vision Direct (Gemini 2.5 Flash Lite)
                    </span>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      ประมวลผลด้วยโมเดล Vision โดยตรง เหมาะสำหรับภาพที่เอียง มีแสงสะท้อน หรือสลิปธนาคารซับซ้อน
                    </p>
                  </div>
                </div>

                {/* Option 3: Local Only */}
                <div
                  onClick={() => setTempEngineMode("local_only")}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all ${
                    tempEngineMode === "local_only"
                      ? "border-indigo-500/80 bg-indigo-950/30 text-indigo-200 ring-1 ring-indigo-500/40"
                      : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="engineMode"
                    checked={tempEngineMode === "local_only"}
                    onChange={() => setTempEngineMode("local_only")}
                    className="mt-1 accent-indigo-500 cursor-pointer"
                  />
                  <div className="space-y-0.5">
                    <span className="font-bold text-xs sm:text-sm text-slate-100">
                      Local Offline Only (WASM / Tesseract)
                    </span>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      ทำงานในอุปกรณ์ 100% ไม่ส่งข้อมูลออกภายนอก ต้องครอบตัดให้ตรงตัวเลขและหมุนภาพให้ตรง
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* API Key section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-slate-200">
                  Gemini API Key (Google AI Studio):
                </label>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 hover:underline hover:text-indigo-300 inline-flex items-center gap-1"
                >
                  รับ API Key ฟรี ↗
                </a>
              </div>
              <Input
                type="password"
                placeholder="AIzaSy..."
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                className="font-mono text-xs text-indigo-300"
              />
              <p className="text-[11px] text-slate-400 leading-relaxed">
                API Key จะถูกจัดเก็บไว้เฉพาะใน Browser ของคุณ (localStorage) และไม่มีการบันทึกบนเซิร์ฟเวอร์
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
                className="mr-auto text-rose-400 hover:text-rose-300 hover:bg-rose-950/20"
              >
                ล้างข้อมูล Key
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowKeyModal(false)}>
              ยกเลิก
            </Button>
            <Button variant="indigo" size="sm" onClick={handleSaveKey}>
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
}: {
  onSwitchToDocument: (file: File) => void;
  apiKey: string;
  engineMode: EngineMode;
}) {
  const [selectedSampleId, setSelectedSampleId] = useState(SAMPLE_METERS[0].id);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MeterAnalyzeResult | null>(null);

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
        ctx.fillStyle = "#090d16";
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
        let effectiveRotation = rotation;
        let croppedCanvas = await getCroppedRotatedCanvas(uploadedFile, effectiveRotation, cropBox);

        // Auto-deskew step
        if (effectiveRotation === 0) {
          try {
            const { estimateDeskewAngle, getCanvasPixelSource } = await import("@/lib/autoDeskew");
            const detectedAngle = estimateDeskewAngle(getCanvasPixelSource(croppedCanvas));
            if (Math.abs(detectedAngle) >= 3) {
              effectiveRotation = detectedAngle;
              croppedCanvas = await getCroppedRotatedCanvas(uploadedFile, effectiveRotation, cropBox);
              setRotation(effectiveRotation);
            }
          } catch {}
        }

        // Transition to Step 2
        setCurrentStep(2);

        const isAiActive = Boolean(apiKey) && engineMode !== "local_only";

        if (isAiActive && engineMode === "ai_only") {
          const base64 = croppedCanvas.toDataURL("image/jpeg", 0.95);
          const res = await fetch("/api/vision", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: base64, mode: "meter", apiKey }),
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
            witness: "Cloud Vision (Gemini 2.5 Flash Lite)",
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
          });
        } else if (isAiActive && engineMode === "dual_hybrid") {
          const base64 = croppedCanvas.toDataURL("image/jpeg", 0.95);
          const { runDualLcdOcr } = await import("@/lib/meterOcr");

          const [localRes, aiRes] = await Promise.allSettled([
            runDualLcdOcr(croppedCanvas),
            fetch("/api/vision", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageBase64: base64, mode: "meter", apiKey }),
            }).then((r) => r.json()),
          ]);

          setCurrentStep(3);

          let witnessA: WitnessReading;
          let localLines: string[] = [];
          if (localRes.status === "fulfilled") {
            witnessA = { ...localRes.value.witnessA, witness: "Witness A (Local SSD)" };
            localLines = localRes.value.extractedLines || [];
          } else {
            witnessA = { raw: "error", confidence: 0, witness: "Witness A (Local SSD)" };
          }

          let witnessB: WitnessReading;
          let aiLines: string[] = [];
          if (aiRes.status === "fulfilled" && aiRes.value.success && aiRes.value.data) {
            const d = aiRes.value.data;
            aiLines =
              d.lines && d.lines.length > 0
                ? d.lines.map(String)
                : [d.sys, d.dia, d.pulse].filter((v: unknown) => v !== null && v !== undefined).map(String);
            const rawVal = aiLines.length > 0 ? aiLines.join(" / ") : String(d.value || "");
            witnessB = {
              raw: rawVal,
              confidence: d.confidence ?? 0.98,
              witness: "Witness B (Cloud Vision Gemini 2.5 Flash Lite)",
            };
          } else {
            const errText = aiRes.status === "fulfilled" ? aiRes.value.error : "Failed to call Cloud Vision";
            witnessB = { raw: `Error: ${errText}`, confidence: 0, witness: "Witness B (Cloud Vision)" };
          }

          const consensus = reconcileWitnesses(witnessA, witnessB);
          const finalLines = aiLines.length > 0 ? aiLines : localLines;
          if (witnessB.confidence > 0.8 && aiLines.length > 0) {
            consensus.consensus = aiLines.join(" / ");
          }

          setData({
            witnessA,
            witnessB,
            result: consensus,
            extractedLines: finalLines,
            isMultiLine: finalLines.length > 1,
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
                variant={!uploadedFile && selectedSampleId === meter.id ? "indigo" : "secondary"}
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
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-slate-800 text-slate-200 border border-slate-700/80 hover:bg-slate-700/80"
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
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-indigo-400" />
                  <span className="text-xs sm:text-sm font-semibold text-slate-100">
                    LCD Alignment & Region of Interest (ROI)
                  </span>
                </div>
                <Button
                  variant={useCrop ? "indigo" : "secondary"}
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
                  <span className="text-slate-400 font-medium">อุปกรณ์ที่รองรับ:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-indigo-500/40 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/50"
                    onClick={() => {
                      setCropBox({ top: 22, left: 24, width: 44, height: 42 });
                      setRotation(0);
                    }}
                  >
                    เครื่องวัดความดัน (Blood Pressure)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-indigo-500/40 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/50"
                    onClick={() => {
                      setCropBox({ top: 18, left: 39, width: 23, height: 22 });
                      setRotation(0);
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
                      setRotation(0);
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
                      setRotation(0);
                    }}
                  >
                    เต็มรูป (Full)
                  </Button>
                </div>

                {/* Rotation & Deskew Toolbar */}
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 text-xs">
                  <span className="text-slate-400 font-medium flex items-center gap-1">
                    <RotateCw className="h-3.5 w-3.5" />
                    หมุนภาพ:
                  </span>
                  <Button
                    variant="emerald"
                    size="sm"
                    className="h-7 text-xs font-semibold gap-1"
                    onClick={async () => {
                      if (!uploadedFile) return;
                      try {
                        const { estimateDeskewAngle, getCanvasPixelSource } = await import("@/lib/autoDeskew");
                        const c = await getCroppedRotatedCanvas(uploadedFile, rotation, cropBox);
                        const angle = estimateDeskewAngle(getCanvasPixelSource(c));
                        if (angle !== 0) {
                          setRotation((r) => Math.max(-45, Math.min(45, r + angle)));
                        }
                      } catch {}
                    }}
                  >
                    <Sparkles className="h-3 w-3" />
                    Auto-Deskew (ปรับตรงอัตโนมัติ)
                  </Button>
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
                      className="h-7 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30"
                      onClick={() => setRotation(0)}
                    >
                      Reset (0°)
                    </Button>
                  )}

                  <div className="flex items-center gap-2 ml-auto w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                    <span className="text-slate-400">มุมเอียง ({rotation}°):</span>
                    <input
                      type="range"
                      min="-45"
                      max="45"
                      value={rotation}
                      onChange={(e) => setRotation(Number(e.target.value))}
                      className="accent-indigo-500 w-24"
                    />
                  </div>
                </div>

                {/* Fine Region Sliders */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs text-slate-400">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Top</span>
                      <span className="font-mono text-slate-300">{cropBox.top}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="90"
                      value={cropBox.top}
                      onChange={(e) => setCropBox({ ...cropBox, top: Number(e.target.value) })}
                      className="accent-indigo-500 w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Left</span>
                      <span className="font-mono text-slate-300">{cropBox.left}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="90"
                      value={cropBox.left}
                      onChange={(e) => setCropBox({ ...cropBox, left: Number(e.target.value) })}
                      className="accent-indigo-500 w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Width</span>
                      <span className="font-mono text-slate-300">{cropBox.width}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      value={cropBox.width}
                      onChange={(e) => setCropBox({ ...cropBox, width: Number(e.target.value) })}
                      className="accent-indigo-500 w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>Height</span>
                      <span className="font-mono text-slate-300">{cropBox.height}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      value={cropBox.height}
                      onChange={(e) => setCropBox({ ...cropBox, height: Number(e.target.value) })}
                      className="accent-indigo-500 w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Display Area */}
          <div className="flex flex-col lg:flex-row items-center justify-center gap-6 rounded-xl border border-slate-800 bg-slate-950/80 p-5 sm:p-6 overflow-hidden">
            {uploadedFile ? (
              <>
                {/* Drag-box selection canvas */}
                <div
                  ref={imageContainerRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  className="relative max-h-72 cursor-crosshair select-none overflow-hidden rounded-lg border border-slate-700/80 shadow-md touch-none"
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
                      className="absolute pointer-events-none border-2 border-indigo-400 bg-indigo-500/20 rounded shadow-md shadow-indigo-500/30"
                      style={{
                        top: `${cropBox.top}%`,
                        left: `${cropBox.left}%`,
                        width: `${cropBox.width}%`,
                        height: `${cropBox.height}%`,
                      }}
                    >
                      <span className="absolute -top-5 left-0 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-mono text-white font-bold whitespace-nowrap shadow">
                        LCD ROI
                      </span>
                    </div>
                  )}
                </div>

                {/* Cropped Zoom Preview */}
                {useCrop && (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-indigo-500/30 bg-slate-900/90 p-4 text-center">
                    <span className="text-xs font-semibold text-indigo-300">
                      ภาพที่จะส่งเข้าโมเดล (Cropped Region)
                    </span>
                    <div className="relative overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-inner">
                      <canvas ref={previewCanvasRef} width={180} height={180} className="block rounded" />
                    </div>
                    <span className="text-[10px] text-slate-400 max-w-[200px] leading-relaxed">
                      คลิกลากบนรูปด้านซ้ายเพื่อเลือกเฉพาะหน้าปัดตัวเลขให้ชัดเจน
                    </span>
                  </div>
                )}
              </>
            ) : (
              <SevenSegmentDisplay ref={svgRef} meter={selectedSample} />
            )}
          </div>

          {/* Action Button */}
          <Button
            variant="indigo"
            size="lg"
            onClick={handleAnalyze}
            disabled={loading}
            className="w-full shadow-lg font-semibold"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                กำลังวิเคราะห์มิเตอร์ด้วย Dual-Witness Engine...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                วิเคราะห์ผลอ่านมิเตอร์ (Analyze Dual-Witness)
              </span>
            )}
          </Button>

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-rose-500/40 bg-rose-950/20 p-4 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading State with Step Progress & Pulsing Skeleton */}
      {loading && (
        <Card className="border-indigo-500/40 bg-slate-900/90">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-indigo-300 text-base">
                <Activity className="h-5 w-5 text-indigo-400 animate-pulse" />
                ระบบกำลังประมวลผล (Real-time Processing Pipeline)
              </CardTitle>
              <Badge variant="indigo" className="animate-pulse">
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
            className={`border transition-all ${
              data.result.status === "agree"
                ? "border-emerald-500/50 bg-gradient-to-b from-emerald-950/20 to-slate-900/90"
                : data.result.status === "partial-agreement"
                ? "border-amber-500/50 bg-gradient-to-b from-amber-950/20 to-slate-900/90"
                : "border-rose-500/50 bg-gradient-to-b from-rose-950/20 to-slate-900/90"
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
                  <span className="text-xs text-slate-400">
                    ความมั่นใจ: {(data.result.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                {data.result.needsHumanReview && (
                  <Badge variant="amber" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Flagged for Human Review
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Primary Value Display */}
              <div className="text-center py-4 rounded-xl bg-slate-950/70 border border-slate-800 shadow-inner">
                <div className="text-xs text-slate-400 font-medium">ค่าฉันทามติที่วิเคราะห์ได้ (Consensus Reading)</div>
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mt-1 font-mono">
                  {data.result.consensus ?? "Unresolved"}
                </div>
              </div>

              {/* Medical Breakdown: Blood Pressure (SYS, DIA, PULSE) */}
              {data.extractedLines && data.extractedLines.length >= 2 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center space-y-1">
                      <div className="text-xs text-slate-400 font-medium">SYS (ความดันตัวบน)</div>
                      <div className="text-3xl font-black text-indigo-300 font-mono">
                        {data.extractedLines[0] || "—"}
                      </div>
                      <div className="text-[11px] text-slate-400">mmHg</div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center space-y-1">
                      <div className="text-xs text-slate-400 font-medium">DIA (ความดันตัวล่าง)</div>
                      <div className="text-3xl font-black text-indigo-300 font-mono">
                        {data.extractedLines[1] || "—"}
                      </div>
                      <div className="text-[11px] text-slate-400">mmHg</div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center space-y-1">
                      <div className="text-xs text-slate-400 font-medium">PULSE (ชีพจร)</div>
                      <div className="text-3xl font-black text-emerald-400 font-mono">
                        {data.extractedLines[2] || "—"}
                      </div>
                      <div className="text-[11px] text-slate-400">bpm</div>
                    </div>
                  </div>

                  {/* AHA Classification Badge */}
                  {(() => {
                    const sys = Number(data.extractedLines[0]);
                    const dia = Number(data.extractedLines[1]);
                    if (!isNaN(sys) && !isNaN(dia)) {
                      const cat = getBloodPressureCategory(sys, dia);
                      return (
                        <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2.5 text-xs">
                          <span className="text-slate-400 font-medium">
                            เกณฑ์ระดับความดันโลหิต (AHA Guideline):
                          </span>
                          <Badge variant={cat.badgeVariant} className="text-xs">
                            {cat.label}
                          </Badge>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}

              {/* Dual Witness Comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-300">
                      {data.witnessA.witness || "Witness A"}
                    </span>
                    <span className="font-mono">{(data.witnessA.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <div className="text-lg font-mono font-bold text-slate-100">
                    {data.witnessA.raw || "—"}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-300">
                      {data.witnessB.witness || "Witness B"}
                    </span>
                    <span className="font-mono">{(data.witnessB.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <div className="text-lg font-mono font-bold text-slate-100">
                    {data.witnessB.raw || "—"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Slip or Document Detected Alert */}
          {data.isLikelyDocOrSlip && uploadedFile && (
            <Card className="border-amber-500/40 bg-amber-950/20">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-amber-300">
                      ภาพนี้อาจเป็นสลิปโอนเงิน หรือเอกสารข้อความภาษาไทย
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      โหมด Meter reading ออกแบบมาเฉพาะสำหรับหน้าปัดดิจิตอล 7-segment แนะนำให้สลับไปที่โหมด
                      Document / Thai OCR เพื่อใช้ AI ถอดรหัสชื่อบัญชี จำนวนเงิน และเลขอ้างอิง
                    </p>
                  </div>
                </div>
                <Button
                  variant="indigo"
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
}: {
  initialFile?: File | null;
  onFileConsumed?: () => void;
  apiKey: string;
  engineMode: EngineMode;
}) {
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DocumentAnalyzeResult | null>(null);
  const [activeView, setActiveView] = useState<"smart" | "formatted" | "json">("smart");
  const [copied, setCopied] = useState(false);

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
      const isAiActive = Boolean(apiKey) && engineMode !== "local_only";

      if (isAiActive && engineMode === "ai_only") {
        setCurrentStep(2);
        setProgress({ status: "Calling Gemini 2.5 Flash Lite Vision Engine...", progress: 0.5 });
        const base64 = await fileToBase64(file);
        const res = await fetch("/api/vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mode: "document", apiKey }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Cloud Vision error");

        setCurrentStep(3);
        const d = json.data;

        const { buildIntelligenceFromVision } = await import("@/lib/documentIntelligence");
        const intelligence = buildIntelligenceFromVision(d);
        const md = d.markdown || "";

        const witness: TextWitnessResult = {
          text: md,
          confidence: d.confidence ?? 0.99,
          witness: "Cloud Vision (Gemini 2.5 Flash Lite)",
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
        setProgress({ status: "Running Dual-Witness: Local Tesseract + Gemini 2.5 Flash Lite...", progress: 0.2 });
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
          body: JSON.stringify({ imageBase64: base64, mode: "document", apiKey }),
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
          markdownB = d.markdown || "";
          wb = {
            text: d.markdown || "",
            confidence: d.confidence ?? 0.99,
            witness: "Witness B (Cloud Vision Gemini 2.5 Flash Lite)",
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

        const { analyzeDocumentIntelligence } = await import("@/lib/documentIntelligence");
        const localIntelligence = analyzeDocumentIntelligence(
          localOcrRes.witnessA.text,
          localOcrRes.witnessA.lines
        );

        const finalIntelligence = aiIntelligence || localIntelligence;
        const mdA = linesToMarkdown(localOcrRes.witnessA.lines);

        setData({
          witnessA: wa,
          witnessB: wb,
          markdownA: mdA,
          markdownB: markdownB || linesToMarkdown(localOcrRes.witnessB.lines),
          result: consensus,
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

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    data?.result.status !== "disagreement" && data
      ? data.witnessA.confidence >= data.witnessB.confidence
        ? data.markdownA
        : data.markdownB
      : null;

  return (
    <div className="space-y-6">
      {/* 1. Document Upload Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>1. อัปโหลดเอกสาร / สลิปโอนเงิน / ใบเสร็จ</CardTitle>
              <CardDescription>
                รองรับไฟล์ PNG, JPG, WEBP และเอกสารข้อความภาษาไทยพร้อมระบบตัดสระลอยอัตโนมัติ
              </CardDescription>
            </div>
            <Badge variant="outline" className="hidden sm:inline-flex">
              Thai OCR Engine
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-700/80 bg-slate-950/60 p-6 sm:p-8 text-center transition hover:border-indigo-500/60">
            <label className="flex flex-col items-center gap-3 cursor-pointer w-full">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 border border-slate-700 text-indigo-400">
                <Upload className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-100">
                  {file ? file.name : "คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่"}
                </p>
                <p className="text-xs text-slate-400">
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
            <div className="flex justify-center rounded-xl border border-slate-800 bg-slate-950 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(file)} alt="Uploaded document" className="max-h-72 rounded-lg object-contain" />
            </div>
          )}

          <Button
            variant="indigo"
            size="lg"
            onClick={handleAnalyze}
            disabled={loading || !file}
            className="w-full shadow-lg font-semibold"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                {progress?.status ?? "กำลังวิเคราะห์เอกสารด้วย Dual-Witness..."}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                วิเคราะห์เอกสาร (Analyze Document)
              </span>
            )}
          </Button>

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-rose-500/40 bg-rose-950/20 p-4 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading State with Step Progress & Pulsing Skeleton */}
      {loading && (
        <Card className="border-indigo-500/40 bg-slate-900/90">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-indigo-300 text-base">
                <Activity className="h-5 w-5 text-indigo-400 animate-pulse" />
                กำลังประมวลผลข้อความและโครงสร้างเอกสาร
              </CardTitle>
              <Badge variant="indigo" className="animate-pulse">
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
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-300 rounded-full"
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
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Witness A (AUTO)</span>
                <span className="font-mono">{(data.witnessA.confidence * 100).toFixed(0)}%</span>
              </div>
              <p className="line-clamp-2 text-xs sm:text-sm text-slate-200">
                {data.witnessA.text.trim() || "—"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Witness B (SPARSE / AI)</span>
                <span className="font-mono">{(data.witnessB.confidence * 100).toFixed(0)}%</span>
              </div>
              <p className="line-clamp-2 text-xs sm:text-sm text-slate-200">
                {data.witnessB.text.trim() || "—"}
              </p>
            </div>
          </div>

          {/* Consensus Status Card */}
          <Card
            className={`border transition-all ${
              data.result.status === "agree"
                ? "border-emerald-500/40 bg-emerald-950/10"
                : "border-amber-500/40 bg-amber-950/10"
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
                    <Badge variant="indigo" className="text-xs">
                      {data.intelligence.typeNameTh}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  ความคล้ายคลึง: {(data.result.similarity * 100).toFixed(0)}% · ความมั่นใจ:{" "}
                  {(data.result.confidence * 100).toFixed(0)}%
                  {data.result.needsHumanReview && " — แนะนำให้ตรวจสอบจุดคลาดเคลื่อน"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    copyToClipboard(
                      activeView === "json"
                        ? JSON.stringify(data.intelligence, null, 2)
                        : resolvedMarkdown ?? ""
                    )
                  }
                  className="h-8 text-xs gap-1.5"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? "คัดลอกแล้ว" : "Copy"}</span>
                </Button>
                {resolvedMarkdown && (
                  <Button
                    variant="indigo"
                    size="sm"
                    onClick={() => downloadMarkdown(resolvedMarkdown)}
                    className="h-8 text-xs gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download .md</span>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Views Toolbar & Content */}
          {resolvedMarkdown !== null ? (
            <Card>
              <CardHeader className="border-b border-slate-800/80 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
                    <Button
                      variant={activeView === "smart" ? "indigo" : "ghost"}
                      size="sm"
                      onClick={() => setActiveView("smart")}
                      className="h-7 text-xs"
                    >
                      Structured Card
                    </Button>
                    <Button
                      variant={activeView === "formatted" ? "indigo" : "ghost"}
                      size="sm"
                      onClick={() => setActiveView("formatted")}
                      className="h-7 text-xs"
                    >
                      Markdown Document
                    </Button>
                    <Button
                      variant={activeView === "json" ? "indigo" : "ghost"}
                      size="sm"
                      onClick={() => setActiveView("json")}
                      className="h-7 text-xs"
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
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-300 space-y-2">
                        <span className="font-semibold text-indigo-300">ข้อมูลการวิเคราะห์เอกสาร:</span>
                        <ul className="list-disc list-inside space-y-1 text-slate-400">
                          {data.intelligence.keyInsights.map((insight, idx) => (
                            <li key={idx}>{insight}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <RenderedMarkdownViewer markdown={resolvedMarkdown} />
                  </div>
                )}

                {activeView === "formatted" && (
                  <RenderedMarkdownViewer markdown={resolvedMarkdown} />
                )}

                {activeView === "json" && (
                  <textarea
                    readOnly
                    value={JSON.stringify(data.intelligence, null, 2)}
                    rows={14}
                    className="w-full resize-y rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-indigo-300 focus:outline-none"
                  />
                )}
              </CardContent>
            </Card>
          ) : (
            /* Disagreement View */
            <Card className="border-rose-500/40 bg-rose-950/10">
              <CardHeader>
                <CardTitle className="text-rose-400 text-base">
                  Witness Disagreement — กรุณาตรวจสอบผลอ่านแบบเคียงคู่กัน
                </CardTitle>
                <CardDescription>
                  ผลการอ่านระหว่าง Witness A และ Witness B มีความแตกต่างเกินเกณฑ์กำหนด
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-300">Witness A Output:</span>
                  <RenderedMarkdownViewer markdown={data.markdownA} />
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-300">Witness B Output:</span>
                  <RenderedMarkdownViewer markdown={data.markdownB} />
                </div>
              </CardContent>
            </Card>
          )}
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
      className={`rounded-2xl border p-5 sm:p-6 shadow-xl space-y-5 ${
        bank?.badgeBg || "bg-slate-900/90"
      } ${bank?.borderColor || "border-slate-800"}`}
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-4 h-4 rounded-full shadow-sm"
            style={{ backgroundColor: bank?.brandColor || "#6366f1" }}
          />
          <span className={`text-sm sm:text-base font-bold tracking-wide ${bank?.textColor || "text-indigo-300"}`}>
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
        <div className="text-center py-4 bg-slate-950/40 rounded-xl border border-white/5">
          <div className="text-xs text-slate-400 font-medium">จำนวนเงินโอน</div>
          <div className="text-3xl sm:text-4xl font-black text-white tracking-tight mt-1 font-mono">
            {slip.amountFormatted}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/50 rounded-xl p-4 border border-white/5 text-xs">
        <div className="space-y-1">
          <span className="text-slate-400 font-medium">จาก (ผู้โอน):</span>
          <div className="font-semibold text-slate-100">{slip.senderName || "—"}</div>
          {slip.senderAccount && <div className="font-mono text-slate-400">{slip.senderAccount}</div>}
        </div>
        <div className="space-y-1 sm:border-l sm:border-white/10 sm:pl-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
          <span className="text-slate-400 font-medium">ไปยัง (ผู้รับเงิน):</span>
          <div className="font-semibold text-slate-100">{slip.receiverName || "—"}</div>
          {slip.receiverAccount && <div className="font-mono text-slate-400">{slip.receiverAccount}</div>}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 pt-1 gap-2">
        {slip.dateTime && (
          <span>
            วันเวลา: <strong className="text-slate-200">{slip.dateTime}</strong>
          </span>
        )}
        {slip.referenceNo && (
          <span>
            เลขอ้างอิง: <strong className="font-mono text-indigo-300">{slip.referenceNo}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

function SmartReceiptCard({ receipt, typeName }: { receipt: ReceiptData; typeName: string }) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 sm:p-6 shadow-xl space-y-5">
      <div className="flex items-center justify-between border-b border-amber-500/20 pb-4">
        <span className="text-sm sm:text-base font-bold text-amber-300">
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
          <div className="bg-slate-950/50 rounded-xl p-4 border border-white/5">
            <div className="text-xs text-slate-400 font-medium">ยอดรวมสุทธิ (Total)</div>
            <div className="text-2xl sm:text-3xl font-black text-amber-300 mt-1 font-mono">
              {receipt.totalFormatted}
            </div>
          </div>
        )}
        {receipt.vatFormatted && (
          <div className="bg-slate-950/50 rounded-xl p-4 border border-white/5">
            <div className="text-xs text-slate-400 font-medium">ภาษีมูลค่าเพิ่ม (VAT 7%)</div>
            <div className="text-2xl sm:text-3xl font-black text-slate-200 mt-1 font-mono">
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

function RenderedMarkdownViewer({ markdown }: { markdown: string }) {
  if (!markdown.trim()) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 text-center text-sm text-slate-500">
        (No text detected)
      </div>
    );
  }

  const lines = markdown.split("\n\n");

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-5 sm:p-6 text-xs sm:text-sm text-slate-200 space-y-3.5 leading-relaxed">
      {lines.map((chunk, idx) => {
        const trimmed = chunk.trim();
        if (trimmed.startsWith("# ")) {
          return (
            <h1 key={idx} className="text-base sm:text-lg font-bold text-indigo-300 border-b border-slate-800 pb-2 pt-1">
              {trimmed.replace(/^#\s+/, "")}
            </h1>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h2 key={idx} className="text-sm sm:text-base font-semibold text-slate-100 border-b border-slate-800/60 pb-1.5">
              {trimmed.replace(/^##\s+/, "")}
            </h2>
          );
        }
        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={idx} className="text-xs sm:text-sm font-semibold text-indigo-300 pt-1">
              {trimmed.replace(/^###\s+/, "")}
            </h3>
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
              <div key={idx} className="overflow-x-auto rounded-xl border border-slate-800 my-3 shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-900/90 text-slate-200">
                    <tr>
                      {headers.map((h, hIdx) => (
                        <th key={hIdx} className="p-3 font-semibold border-b border-slate-700/80">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-white/5 transition-colors">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="p-3 text-slate-300">
                            {cell}
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
        if (trimmed.startsWith("- ")) {
          const itemText = trimmed.replace(/^- /, "");
          const kvMatch = itemText.match(/^\*\*([^*]+)\*\*:\s*(.+)$/);
          if (kvMatch) {
            return (
              <div key={idx} className="flex justify-between items-center py-1.5 border-b border-slate-800/40 text-xs sm:text-sm">
                <span className="text-slate-400 font-medium">{kvMatch[1]}:</span>
                <span className="text-slate-100 font-semibold">{kvMatch[2]}</span>
              </div>
            );
          }
          return (
            <div key={idx} className="flex items-start gap-2 text-slate-300 text-xs sm:text-sm">
              <span className="text-indigo-400 mt-0.5">•</span>
              <span>{itemText}</span>
            </div>
          );
        }
        return (
          <p key={idx} className="text-xs sm:text-sm text-slate-300">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}
