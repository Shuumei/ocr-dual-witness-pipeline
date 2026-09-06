"use client";

import { useEffect, useRef, useState } from "react";
import { SevenSegmentDisplay } from "@/components/SevenSegmentDisplay";
import { reconcileWitnesses, type ConsensusResult, type WitnessReading } from "@/lib/consensus";
import { decodeDisplay, decodeDisplayAutoAlign, type PixelSource, type Polarity } from "@/lib/imageDecoder";
import { getSvgPixels } from "@/lib/getSvgPixels";
import { getImagePixels, cropPixelSource, type CropRect } from "@/lib/getImagePixels";
import { detectContent, detectDisplayPolarity } from "@/lib/cropToContent";
import { SAMPLE_METERS } from "@/lib/samples";
import { reconcileTextWitnesses, type TextConsensusResult, type TextWitnessResult } from "@/lib/textConsensus";
import { linesToMarkdown } from "@/lib/formatAsMarkdown";
import type { OcrProgress } from "@/lib/textOcr";

const STATUS_STYLE: Record<ConsensusResult["status"], string> = {
  agree: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  "partial-agreement": "bg-amber-500/15 text-amber-400 border-amber-500/40",
  disagreement: "bg-red-500/15 text-red-400 border-red-500/40",
};

type Mode = "meter" | "document";

export default function Home() {
  const [mode, setMode] = useState<Mode>("meter");
  const [stagedDocumentFile, setStagedDocumentFile] = useState<File | null>(null);

  function handleSwitchToDocument(file: File) {
    setStagedDocumentFile(file);
    setMode("document");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-16 text-neutral-100">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">OCR Dual-Witness Consensus Engine</h1>
        <p className="text-sm text-neutral-400">
          Cross-validates text and digit extraction using two independent, client-side decoding passes.
          When readings agree, confidence is boosted; discrepancies are flagged for review.
          Runs entirely in-browser with zero backend dependencies.
        </p>
      </header>

      <div className="flex gap-2 border-b border-neutral-800">
        <ModeTab active={mode === "meter"} onClick={() => setMode("meter")}>
          Meter reading (7-segment & LCD)
        </ModeTab>
        <ModeTab active={mode === "document"} onClick={() => setMode("document")}>
          Document / UI (General & Thai OCR)
        </ModeTab>
      </div>

      {mode === "meter" ? (
        <MeterMode onSwitchToDocument={handleSwitchToDocument} />
      ) : (
        <DocumentMode initialFile={stagedDocumentFile} onFileConsumed={() => setStagedDocumentFile(null)} />
      )}
    </main>
  );
}

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
        active ? "border-cyan-400 text-cyan-300" : "border-transparent text-neutral-500 hover:text-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------------- */
/* Mode 1: calibrated 7-segment meter reading                             */
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

function getBloodPressureCategory(sys: number, dia: number): { label: string; color: string } {
  if (sys < 120 && dia < 80) return { label: "ความดันปกติ (Normal)", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" };
  if (sys <= 129 && dia < 80) return { label: "ความดันเริ่มสูง (Elevated)", color: "text-amber-400 border-amber-500/30 bg-amber-500/10" };
  if (sys <= 139 || (dia >= 80 && dia <= 89)) return { label: "ความดันสูงระดับ 1 (Stage 1 Hypertension)", color: "text-orange-400 border-orange-500/30 bg-orange-500/10" };
  return { label: "ความดันสูงระดับ 2 (Stage 2 Hypertension)", color: "text-rose-400 border-rose-500/30 bg-rose-500/10" };
}

function MeterMode({ onSwitchToDocument }: { onSwitchToDocument: (file: File) => void }) {
  const [selectedSampleId, setSelectedSampleId] = useState(SAMPLE_METERS[0].id);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MeterAnalyzeResult | null>(null);

  // Manual ROI crop & rotation controls for blood pressure monitors / LCDs
  const [useCrop, setUseCrop] = useState(true);
  const [cropBox, setCropBox] = useState({ top: 30, left: 35, width: 30, height: 28 });
  const [rotation, setRotation] = useState<number>(0);

  // Interactive pointer drag box selection
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const selectedSample = SAMPLE_METERS.find((m) => m.id === selectedSampleId)!;

  // Live update the zoomed preview canvas whenever image, rotation, or crop changes
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
        ctx.fillStyle = "#111827";
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
    setError(null);
    setData(null);
    try {
      if (uploadedFile) {
        const croppedCanvas = await getCroppedRotatedCanvas(uploadedFile, rotation, cropBox);
        const { runDualLcdOcr } = await import("@/lib/meterOcr");
        const lcdResult = await runDualLcdOcr(croppedCanvas);

        setData({
          witnessA: lcdResult.witnessA,
          witnessB: lcdResult.witnessB,
          result: lcdResult.consensus,
          extractedLines: lcdResult.extractedLines,
          isMultiLine: lcdResult.isMultiLine,
        });
      } else {
        if (!svgRef.current) throw new Error("No sample rendered yet.");
        const pixels = await getSvgPixels(svgRef.current);
        setData(runMeterWitnesses(pixels, "light-on-dark", false));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <details className="rounded-md border border-neutral-800 bg-neutral-900/50 text-sm text-neutral-400 open:pb-3">
        <summary className="cursor-pointer select-none px-3 py-2 text-neutral-300">How it works</summary>
        <div className="flex flex-col gap-2 px-3">
          <p>
            The display is rasterized to a pixel grid, then scanned left to right. At each
            position the engine checks two fixed points (where a 7-segment digit&apos;s vertical bars
            would be) to locate segment boundaries.
          </p>
          <p>
            When a digit is found, it evaluates brightness across the 7 segments against a digit lookup table.
            Witness A checks single pixels against a fixed threshold; Witness B averages a 3×3 region against an
            adaptive luminance threshold.
          </p>
        </div>
      </details>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-neutral-300">1. Pick a source</h2>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_METERS.map((meter) => (
            <button
              key={meter.id}
              onClick={() => {
                setSelectedSampleId(meter.id);
                setUploadedFile(null);
                setData(null);
              }}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                !uploadedFile && selectedSampleId === meter.id
                  ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                  : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
              }`}
            >
              {meter.label}
            </button>
          ))}
          <label
            className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm transition ${
              uploadedFile
                ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
            }`}
          >
            Upload your own
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

        {uploadedFile && (
          <div className="flex flex-col gap-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-200">
                🎯 LCD Alignment & Interactive Region Selector (คลิกลากกรอบบนรูปได้โดยตรง)
              </span>
              <button
                onClick={() => setUseCrop(!useCrop)}
                className={`text-xs px-2.5 py-1 rounded border transition ${
                  useCrop
                    ? "border-cyan-400 bg-cyan-400/20 text-cyan-300"
                    : "border-neutral-700 text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {useCrop ? "Crop Box: ON" : "Crop Box: OFF"}
              </button>
            </div>

            {/* Quick Presets & Rotation Controls */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-neutral-500">Presets:</span>
                <button
                  onClick={() => {
                    setCropBox({ top: 30, left: 35, width: 28, height: 26 });
                    setRotation(0);
                  }}
                  className="rounded bg-cyan-950/80 border border-cyan-700/60 px-2.5 py-1 text-cyan-300 font-medium hover:bg-cyan-900"
                >
                  🩺 เครื่องวัดความดัน (Omron)
                </button>
                <button
                  onClick={() => {
                    setCropBox({ top: 18, left: 39, width: 23, height: 22 });
                    setRotation(0);
                  }}
                  className="rounded bg-cyan-950/80 border border-cyan-700/60 px-2.5 py-1 text-cyan-300 font-medium hover:bg-cyan-900"
                >
                  🩸 เครื่องวัดน้ำตาล (Accu-Chek)
                </button>
                <button
                  onClick={() => setCropBox({ top: 25, left: 25, width: 50, height: 50 })}
                  className="rounded bg-neutral-800 px-2.5 py-1 text-neutral-300 hover:bg-neutral-700"
                >
                  Center LCD
                </button>
                <button
                  onClick={() => {
                    setCropBox({ top: 0, left: 0, width: 100, height: 100 });
                    setRotation(0);
                  }}
                  className="rounded bg-neutral-800 px-2.5 py-1 text-neutral-400 hover:bg-neutral-700"
                >
                  เต็มรูป (Full)
                </button>
              </div>

              {/* Rotation & Deskew Controls */}
              <div className="flex flex-wrap items-center gap-3 rounded border border-neutral-800/80 bg-neutral-950/40 p-2.5 text-xs text-neutral-300">
                <span className="text-neutral-400 font-medium">หมุนภาพ (Rotate / Deskew):</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
                    className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 hover:border-cyan-500 hover:text-cyan-300"
                    title="หมุนซ้าย 90°"
                  >
                    ↺ -90°
                  </button>
                  <button
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 hover:border-cyan-500 hover:text-cyan-300"
                    title="หมุนขวา 90°"
                  >
                    ↻ +90°
                  </button>
                  <button
                    onClick={() => setRotation((r) => r - 5)}
                    className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 hover:border-cyan-500 hover:text-cyan-300"
                    title="เอียงซ้าย 5°"
                  >
                    ⟲ -5°
                  </button>
                  <button
                    onClick={() => setRotation((r) => r + 5)}
                    className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 hover:border-cyan-500 hover:text-cyan-300"
                    title="เอียงขวา 5°"
                  >
                    ⟳ +5°
                  </button>
                  {rotation !== 0 && (
                    <button
                      onClick={() => setRotation(0)}
                      className="rounded border border-rose-800/40 bg-rose-950/30 px-2 py-1 text-rose-300 hover:bg-rose-900/50"
                    >
                      Reset (0°)
                    </button>
                  )}
                </div>

                <label className="flex items-center gap-2 ml-auto">
                  <span>มุมเอียง ({rotation}°):</span>
                  <input
                    type="range"
                    min="-45"
                    max="45"
                    value={rotation}
                    onChange={(e) => setRotation(Number(e.target.value))}
                    className="accent-cyan-400 w-28"
                  />
                </label>
              </div>

              {/* Fine Sliders */}
              <div className="grid grid-cols-2 gap-3 text-xs text-neutral-400 sm:grid-cols-4">
                <label className="flex flex-col gap-1">
                  Top ({cropBox.top}%)
                  <input
                    type="range"
                    min="0"
                    max="90"
                    value={cropBox.top}
                    onChange={(e) => setCropBox({ ...cropBox, top: Number(e.target.value) })}
                    className="accent-cyan-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Left ({cropBox.left}%)
                  <input
                    type="range"
                    min="0"
                    max="90"
                    value={cropBox.left}
                    onChange={(e) => setCropBox({ ...cropBox, left: Number(e.target.value) })}
                    className="accent-cyan-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Width ({cropBox.width}%)
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={cropBox.width}
                    onChange={(e) => setCropBox({ ...cropBox, width: Number(e.target.value) })}
                    className="accent-cyan-400"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Height ({cropBox.height}%)
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={cropBox.height}
                    onChange={(e) => setCropBox({ ...cropBox, height: Number(e.target.value) })}
                    className="accent-cyan-400"
                  />
                </label>
              </div>
            </div>

            <p className="text-[11px] text-neutral-400">
              💡 <strong>คำแนะนำ:</strong> ใช้เมาส์<strong>คลิกลากบนรูปด้านล่าง</strong>เพื่อครอบเฉพาะหน้าจอ LCD หรือใช้ปุ่มหมุนภาพให้ตัวเลขตั้งตรงก่อนกด Analyze
            </p>
          </div>
        )}

        <div className="relative flex flex-col lg:flex-row items-center justify-center gap-6 rounded-lg border border-neutral-800 bg-black/60 p-6 overflow-hidden">
          {uploadedFile ? (
            <>
              {/* Interactive Image with Drag Box Overlay */}
              <div
                ref={imageContainerRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className="relative max-h-80 cursor-crosshair select-none overflow-hidden rounded border border-neutral-800 shadow-md touch-none"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={URL.createObjectURL(uploadedFile)}
                  alt="Uploaded display"
                  className="max-h-80 rounded block pointer-events-none transition-transform duration-100"
                  style={{ transform: `rotate(${rotation}deg)` }}
                />
                {useCrop && (
                  <div
                    className="absolute pointer-events-none border-2 border-cyan-400 bg-cyan-400/20 rounded shadow-md shadow-cyan-400/40 transition-[top,left,width,height] duration-75"
                    style={{
                      top: `${cropBox.top}%`,
                      left: `${cropBox.left}%`,
                      width: `${cropBox.width}%`,
                      height: `${cropBox.height}%`,
                    }}
                  >
                    <span className="absolute -top-5 left-0 rounded bg-cyan-500 px-1.5 py-0.5 text-[10px] font-mono text-black font-bold whitespace-nowrap shadow">
                      LCD Area
                    </span>
                  </div>
                )}
              </div>

              {/* Exact Zoomed Cropped Preview Canvas */}
              {useCrop && (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-cyan-800/40 bg-neutral-900/90 p-3 text-center">
                  <span className="text-xs font-semibold text-cyan-300">🔍 สิ่งที่ Local Model กำลังจะอ่าน:</span>
                  <div className="relative overflow-hidden rounded border border-neutral-700 bg-neutral-950 flex items-center justify-center shadow-inner">
                    <canvas ref={previewCanvasRef} width={180} height={180} className="block rounded" />
                  </div>
                  <span className="text-[10px] text-neutral-400 max-w-[200px]">
                    ตรวจสอบให้เห็นตัวเลขชัดเจนในกรอบนี้ และไม่มีขอบผ้าหรือสิ่งรบกวน
                  </span>
                </div>
              )}
            </>
          ) : (
            <SevenSegmentDisplay ref={svgRef} meter={selectedSample} />
          )}
        </div>
      </section>

      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="rounded-md bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-400 disabled:opacity-50 shadow-sm"
      >
        {loading ? "Reading 7-Segment LCD with Local Model..." : "Analyze (Local 7-Segment Model)"}
      </button>

      {error && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">{error}</p>
      )}

      {data && (
        <section className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <MeterWitnessCard label={data.witnessA.witness || "Witness A"} reading={data.witnessA} />
            <MeterWitnessCard label={data.witnessB.witness || "Witness B"} reading={data.witnessB} />
          </div>

          <div className={`rounded-lg border p-5 ${STATUS_STYLE[data.result.status]}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide opacity-70">{data.result.status}</p>
              <span className="text-xs px-2 py-0.5 rounded bg-black/30 font-mono">
                confidence {(data.result.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-2xl font-bold mt-1">{data.result.consensus ?? "unresolved"}</p>
            {data.result.needsHumanReview && (
              <p className="mt-1 text-xs text-amber-300">⚠️ Flagged for human review — ค่าระหว่าง 2 Witness มีความต่าง</p>
            )}

            {/* Blood pressure / multi-row parameter breakdown */}
            {data.extractedLines && data.extractedLines.length >= 2 && (
              <div className="mt-4 pt-4 border-t border-white/15 flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-black/30 p-2.5 border border-white/5">
                    <div className="text-xs text-neutral-400 font-medium">SYS (ความดันตัวบน)</div>
                    <div className="text-2xl font-black text-cyan-300">{data.extractedLines[0] || "—"}</div>
                    <div className="text-[10px] text-neutral-400">mmHg</div>
                  </div>
                  <div className="rounded-lg bg-black/30 p-2.5 border border-white/5">
                    <div className="text-xs text-neutral-400 font-medium">DIA (ความดันตัวล่าง)</div>
                    <div className="text-2xl font-black text-cyan-300">{data.extractedLines[1] || "—"}</div>
                    <div className="text-[10px] text-neutral-400">mmHg</div>
                  </div>
                  <div className="rounded-lg bg-black/30 p-2.5 border border-white/5">
                    <div className="text-xs text-neutral-400 font-medium">PULSE (ชีพจร)</div>
                    <div className="text-2xl font-black text-emerald-300">{data.extractedLines[2] || "—"}</div>
                    <div className="text-[10px] text-neutral-400">bpm</div>
                  </div>
                </div>

                {/* Medical Blood Pressure Category */}
                {(() => {
                  const sys = Number(data.extractedLines[0]);
                  const dia = Number(data.extractedLines[1]);
                  if (!isNaN(sys) && !isNaN(dia)) {
                    const cat = getBloodPressureCategory(sys, dia);
                    return (
                      <div className={`flex items-center justify-between rounded border px-3 py-1.5 text-xs ${cat.color}`}>
                        <span className="font-medium">เกณฑ์ระดับความดันโลหิต (AHA Guideline):</span>
                        <span className="font-bold">{cat.label}</span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </div>

          {data.isLikelyDocOrSlip && uploadedFile && (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200">
              <p className="font-semibold text-amber-300">
                ⚠️ ภาพนี้อาจเป็น สลิปโอนเงิน หรือ เอกสารข้อความทั่วไป (ไม่ใช่หน้าปัด 7-segment)
              </p>
              <p className="text-neutral-300">
                โหมด Meter reading ออกแบบมาเฉพาะหน้าปัดตัวเลขดิจิตอล 7-segment (เช่น เครื่องวัดความดัน, มิเตอร์ไฟ)
                หากต้องการอ่านสลิป ใบเสร็จ หรือเอกสารภาษาไทย แนะนำให้ใช้โหมด Document / UI
              </p>
              <button
                onClick={() => onSwitchToDocument(uploadedFile)}
                className="mt-1 w-fit rounded bg-amber-400 px-3 py-1.5 font-medium text-neutral-950 transition hover:bg-amber-300"
              >
                👉 สลับไปที่โหมด Document / UI ด้วยภาพนี้
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function MeterWitnessCard({ label, reading }: { label: string; reading: WitnessReading }) {
  return (
    <div className="rounded-lg border border-neutral-800 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-lg font-mono">{reading.raw || "—"}</p>
      <p className="text-xs text-neutral-500">confidence {(reading.confidence * 100).toFixed(0)}%</p>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Mode 2: general document / UI OCR, output as Markdown                  */
/* ---------------------------------------------------------------------- */

import type { DocumentIntelligenceResult, BankSlipData, ReceiptData } from "@/lib/documentIntelligence";

interface DocumentAnalyzeResult {
  witnessA: TextWitnessResult;
  witnessB: TextWitnessResult;
  markdownA: string;
  markdownB: string;
  result: TextConsensusResult;
  intelligence?: DocumentIntelligenceResult;
}

function SmartSlipCard({ slip, typeName }: { slip: BankSlipData; typeName: string }) {
  const bank = slip.bank;
  return (
    <div
      className={`rounded-xl border p-5 shadow-lg flex flex-col gap-4 ${
        bank?.badgeBg || "bg-neutral-900/90"
      } ${bank?.borderColor || "border-neutral-800"}`}
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-3.5 h-3.5 rounded-full shadow" style={{ backgroundColor: bank?.brandColor || "#06b6d4" }} />
          <span className={`text-sm font-bold tracking-wide ${bank?.textColor || "text-cyan-300"}`}>
            {bank?.name || typeName}
          </span>
        </div>
        {slip.isSuccessful && (
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-medium">
            ✓ โอนเงินสำเร็จ
          </span>
        )}
      </div>

      {slip.amountFormatted && (
        <div className="text-center py-2 bg-black/20 rounded-lg border border-white/5">
          <div className="text-xs text-neutral-400 font-medium">จำนวนเงินโอน</div>
          <div className="text-3xl sm:text-4xl font-black text-white tracking-tight mt-0.5">
            {slip.amountFormatted}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-black/30 rounded-lg p-3 border border-white/5 text-xs">
        <div className="flex flex-col gap-1">
          <span className="text-neutral-400 font-medium">จาก (ผู้โอน):</span>
          <span className="font-semibold text-neutral-200">{slip.senderName || "—"}</span>
          {slip.senderAccount && <span className="font-mono text-neutral-400">{slip.senderAccount}</span>}
        </div>
        <div className="flex flex-col gap-1 sm:border-l sm:border-white/10 sm:pl-3">
          <span className="text-neutral-400 font-medium">ไปยัง (ผู้รับเงิน):</span>
          <span className="font-semibold text-neutral-200">{slip.receiverName || "—"}</span>
          {slip.receiverAccount && <span className="font-mono text-neutral-400">{slip.receiverAccount}</span>}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between text-xs text-neutral-400 pt-1 gap-2">
        {slip.dateTime && (
          <span>
            วันเวลา: <strong className="text-neutral-200">{slip.dateTime}</strong>
          </span>
        )}
        {slip.referenceNo && (
          <span>
            เลขอ้างอิง: <strong className="font-mono text-cyan-300">{slip.referenceNo}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

function SmartReceiptCard({ receipt, typeName }: { receipt: ReceiptData; typeName: string }) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-5 shadow-lg flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-amber-500/20 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🧾</span>
          <span className="text-sm font-bold text-amber-300">{receipt.merchantName || typeName}</span>
        </div>
        {receipt.taxId && (
          <span className="text-xs px-2 py-0.5 rounded bg-neutral-900 border border-neutral-700 text-neutral-300 font-mono">
            Tax ID: {receipt.taxId}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-center">
        {receipt.totalFormatted && (
          <div className="bg-black/30 rounded-lg p-3 border border-white/5">
            <div className="text-xs text-neutral-400 font-medium">ยอดรวมสุทธิ (Total)</div>
            <div className="text-2xl font-black text-amber-300 mt-0.5">{receipt.totalFormatted}</div>
          </div>
        )}
        {receipt.vatFormatted && (
          <div className="bg-black/30 rounded-lg p-3 border border-white/5">
            <div className="text-xs text-neutral-400 font-medium">ภาษีมูลค่าเพิ่ม (VAT 7%)</div>
            <div className="text-2xl font-black text-neutral-200 mt-0.5">{receipt.vatFormatted}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentMode({
  initialFile,
  onFileConsumed,
}: {
  initialFile?: File | null;
  onFileConsumed?: () => void;
}) {
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DocumentAnalyzeResult | null>(null);
  const [activeView, setActiveView] = useState<"smart" | "formatted" | "json">("smart");
  const [copied, setCopied] = useState(false);

  // Sync if initialFile was passed from switch button
  if (initialFile && initialFile !== file) {
    setFile(initialFile);
    onFileConsumed?.();
  }

  async function handleAnalyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setData(null);
    setProgress(null);
    try {
      const { runDualTextOcr } = await import("@/lib/textOcr");
      const { witnessA, witnessB } = await runDualTextOcr(file, setProgress);

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

      // Default to smart tab if bank slip or receipt was detected
      if (intelligence.docType !== "general_document") {
        setActiveView("smart");
      } else {
        setActiveView("formatted");
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
    <div className="flex flex-col gap-8">
      <details className="rounded-md border border-neutral-800 bg-neutral-900/50 text-sm text-neutral-400 open:pb-3">
        <summary className="cursor-pointer select-none px-3 py-2 text-neutral-300">How it works</summary>
        <div className="flex flex-col gap-2 px-3">
          <p>
            Runs <a className="underline text-cyan-400" href="https://github.com/naptha/tesseract.js">Tesseract.js</a> (WebAssembly)
            twice using distinct page segmentation modes (PSM): AUTO and SPARSE_TEXT.
          </p>
          <p>
            Equipped with <strong>Smart Document Intelligence</strong>: automatically identifies Thai bank slips, receipts, and invoices,
            extracts financial entities (amount, accounts, ref numbers, taxes), formats tables, and cleans all Thai floating vowels and tone marks.
          </p>
        </div>
      </details>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-neutral-300">1. Upload an image (Bank Slips, Receipts, Documents, UI)</h2>
        <label className="w-fit cursor-pointer rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-400 transition hover:border-neutral-500">
          {file ? file.name : "Choose an image"}
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

        {file && (
          <div className="flex justify-center rounded-lg border border-neutral-800 bg-black/50 p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={URL.createObjectURL(file)} alt="Uploaded document" className="max-h-72 rounded object-contain" />
          </div>
        )}
      </section>

      <button
        onClick={handleAnalyze}
        disabled={loading || !file}
        className="rounded-md bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-400 disabled:opacity-50 shadow-sm"
      >
        {loading ? progress?.status ?? "Reading text & analyzing document..." : "Analyze Document (Smart Thai OCR)"}
      </button>

      {loading && progress && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs text-neutral-400">
            <span>{progress.status}</span>
            <span>{Math.round(progress.progress * 100)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full bg-cyan-500 transition-all"
              style={{ width: `${Math.round(progress.progress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">{error}</p>
      )}

      {data && (
        <section className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            <TextWitnessCard label="Witness A · AUTO segmentation" text={data.witnessA.text} confidence={data.witnessA.confidence} />
            <TextWitnessCard label="Witness B · SPARSE_TEXT segmentation" text={data.witnessB.text} confidence={data.witnessB.confidence} />
          </div>

          <div className={`rounded-lg border p-4 ${STATUS_STYLE[data.result.status]}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide opacity-70">{data.result.status}</p>
              {data.intelligence && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-black/40 text-cyan-300">
                  {data.intelligence.typeNameTh}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm opacity-80">
              similarity {(data.result.similarity * 100).toFixed(0)}% · confidence{" "}
              {(data.result.confidence * 100).toFixed(0)}%
              {data.result.needsHumanReview && " — flagged for human review"}
            </p>
          </div>

          {resolvedMarkdown !== null ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2 flex-wrap gap-2">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setActiveView("smart")}
                    className={`text-xs px-3 py-1.5 rounded transition ${
                      activeView === "smart"
                        ? "bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    ✨ สรุปข้อมูลอัจฉริยะ (Smart Card)
                  </button>
                  <button
                    onClick={() => setActiveView("formatted")}
                    className={`text-xs px-3 py-1.5 rounded transition ${
                      activeView === "formatted"
                        ? "bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    📝 รูปแบบเอกสาร (Markdown)
                  </button>
                  <button
                    onClick={() => setActiveView("json")}
                    className={`text-xs px-3 py-1.5 rounded transition ${
                      activeView === "json"
                        ? "bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    📊 ข้อมูล JSON
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      copyToClipboard(
                        activeView === "json"
                          ? JSON.stringify(data.intelligence, null, 2)
                          : resolvedMarkdown
                      )
                    }
                    className="text-xs text-neutral-300 hover:text-cyan-300 border border-neutral-700 px-2.5 py-1 rounded transition"
                  >
                    {copied ? "✓ คัดลอกแล้ว!" : activeView === "json" ? "Copy JSON" : "Copy Text"}
                  </button>
                  <button
                    onClick={() => downloadMarkdown(resolvedMarkdown)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-800/60 bg-cyan-950/40 px-2.5 py-1 rounded transition"
                  >
                    Download .md
                  </button>
                </div>
              </div>

              {activeView === "smart" && (
                <div className="flex flex-col gap-4">
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
                    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 text-xs text-neutral-300 flex flex-col gap-2">
                      <span className="font-semibold text-cyan-300">📄 ข้อมูลการวิเคราะห์เอกสาร:</span>
                      <ul className="list-disc list-inside space-y-1 text-neutral-400">
                        {data.intelligence.keyInsights.map((insight, idx) => (
                          <li key={idx}>{insight}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Render Structured Markdown underneath the card */}
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
                  className="w-full resize-y rounded-md border border-neutral-800 bg-neutral-950 p-3 font-mono text-xs text-cyan-300"
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-red-400">
                Witnesses disagree — displaying both outputs side-by-side for human review:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-neutral-400">Witness A Output:</span>
                  <RenderedMarkdownViewer markdown={data.markdownA} />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-neutral-400">Witness B Output:</span>
                  <RenderedMarkdownViewer markdown={data.markdownB} />
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function TextWitnessCard({ label, text, confidence }: { label: string; text: string; confidence: number }) {
  return (
    <div className="rounded-lg border border-neutral-800 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="line-clamp-3 text-sm text-neutral-200">{text.trim() || "—"}</p>
      <p className="mt-1 text-xs text-neutral-500">confidence {(confidence * 100).toFixed(0)}%</p>
    </div>
  );
}

/**
 * Renders structured Markdown with clean typography, responsive tables,
 * key-value badge layout, and high readability for Thai text, slips, and invoices.
 */
function RenderedMarkdownViewer({ markdown }: { markdown: string }) {
  if (!markdown.trim()) {
    return (
      <div className="rounded-md border border-neutral-800 bg-neutral-900/60 p-6 text-center text-sm text-neutral-500">
        (No text detected)
      </div>
    );
  }

  const lines = markdown.split("\n\n");

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900/70 p-5 text-sm text-neutral-200 space-y-3 leading-relaxed">
      {lines.map((chunk, idx) => {
        const trimmed = chunk.trim();
        if (trimmed.startsWith("# ")) {
          return (
            <h1 key={idx} className="text-lg font-bold text-cyan-300 border-b border-neutral-800 pb-1.5 pt-1">
              {trimmed.replace(/^#\s+/, "")}
            </h1>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h2 key={idx} className="text-base font-semibold text-neutral-100 border-b border-neutral-800/60 pb-1">
              {trimmed.replace(/^##\s+/, "")}
            </h2>
          );
        }
        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={idx} className="text-sm font-semibold text-cyan-300 pt-1">
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
              <div key={idx} className="overflow-x-auto rounded-lg border border-neutral-800 my-2 shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-neutral-800/90 text-neutral-200">
                    <tr>
                      {headers.map((h, hIdx) => (
                        <th key={hIdx} className="p-2.5 font-semibold border-b border-neutral-700">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60 bg-neutral-900/40">
                    {rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-white/5 transition">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="p-2.5 text-neutral-300">
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
          // Key-value pair: **Key**: Value
          const kvMatch = itemText.match(/^\*\*([^*]+)\*\*:\s*(.+)$/);
          if (kvMatch) {
            return (
              <div key={idx} className="flex justify-between items-center py-1 border-b border-neutral-800/40 text-xs sm:text-sm">
                <span className="text-neutral-400 font-medium">{kvMatch[1]}:</span>
                <span className="text-neutral-100 font-semibold">{kvMatch[2]}</span>
              </div>
            );
          }
          return (
            <div key={idx} className="flex items-start gap-2 text-neutral-300 text-xs sm:text-sm">
              <span className="text-cyan-400 mt-0.5">•</span>
              <span>{itemText}</span>
            </div>
          );
        }
        return (
          <p key={idx} className="text-xs sm:text-sm text-neutral-300">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

