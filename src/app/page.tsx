"use client";

import { useRef, useState } from "react";
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

function MeterMode({ onSwitchToDocument }: { onSwitchToDocument: (file: File) => void }) {
  const [selectedSampleId, setSelectedSampleId] = useState(SAMPLE_METERS[0].id);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MeterAnalyzeResult | null>(null);

  // Manual ROI crop controls for blood pressure monitors / LCDs
  const [useCrop, setUseCrop] = useState(true);
  const [cropBox, setCropBox] = useState({ top: 15, left: 10, width: 80, height: 70 });

  const svgRef = useRef<SVGSVGElement>(null);
  const selectedSample = SAMPLE_METERS.find((m) => m.id === selectedSampleId)!;

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      if (uploadedFile) {
        // Auto-downscales high-res mobile photos to prevent freezing
        const raw = await getImagePixels(uploadedFile, 1200);

        let targetPixels: PixelSource = raw;
        if (useCrop) {
          const rect: CropRect = {
            x: (cropBox.left / 100) * raw.width,
            y: (cropBox.top / 100) * raw.height,
            width: (cropBox.width / 100) * raw.width,
            height: (cropBox.height / 100) * raw.height,
          };
          targetPixels = cropPixelSource(raw, rect);
        }

        // Render targetPixels onto a temporary canvas for high-precision real-device LCD OCR
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = targetPixels.width;
        tempCanvas.height = targetPixels.height;
        const ctx = tempCanvas.getContext("2d");
        if (ctx) {
          const imgData = ctx.createImageData(targetPixels.width, targetPixels.height);
          imgData.data.set(targetPixels.data);
          ctx.putImageData(imgData, 0, 0);
        }

        const { runDualLcdOcr } = await import("@/lib/meterOcr");
        const lcdResult = await runDualLcdOcr(tempCanvas);

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
          <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-300">LCD / Display Region Selector</span>
              <button
                onClick={() => setUseCrop(!useCrop)}
                className={`text-xs px-2.5 py-1 rounded border transition ${
                  useCrop
                    ? "border-cyan-400 bg-cyan-400/20 text-cyan-300"
                    : "border-neutral-700 text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {useCrop ? "Custom LCD Crop: ON" : "Custom LCD Crop: OFF"}
              </button>
            </div>

            {useCrop && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="text-neutral-500 py-1">Quick Presets:</span>
                  <button
                    onClick={() => setCropBox({ top: 30, left: 38, width: 26, height: 24 })}
                    className="rounded bg-cyan-950/80 border border-cyan-700/60 px-2 py-1 text-cyan-300 font-medium hover:bg-cyan-900"
                  >
                    🎯 เครื่องวัดความดัน (Omron แนวตั้ง)
                  </button>
                  <button
                    onClick={() => setCropBox({ top: 12, left: 38, width: 25, height: 26 })}
                    className="rounded bg-cyan-950/80 border border-cyan-700/60 px-2 py-1 text-cyan-300 font-medium hover:bg-cyan-900"
                  >
                    🎯 เครื่องวัดน้ำตาล (Accu-Chek)
                  </button>
                  <button
                    onClick={() => setCropBox({ top: 20, left: 15, width: 70, height: 60 })}
                    className="rounded bg-neutral-800 px-2 py-1 text-neutral-300 hover:bg-neutral-700"
                  >
                    Center LCD
                  </button>
                  <button
                    onClick={() => setCropBox({ top: 0, left: 0, width: 100, height: 100 })}
                    className="rounded bg-neutral-800 px-2 py-1 text-neutral-400 hover:bg-neutral-700"
                  >
                    เต็มรูป (Full)
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs text-neutral-400 sm:grid-cols-4">
                  <label className="flex flex-col gap-1">
                    Top ({cropBox.top}%)
                    <input
                      type="range"
                      min="0"
                      max="80"
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
                      max="80"
                      value={cropBox.left}
                      onChange={(e) => setCropBox({ ...cropBox, left: Number(e.target.value) })}
                      className="accent-cyan-400"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Width ({cropBox.width}%)
                    <input
                      type="range"
                      min="10"
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
                      min="10"
                      max="100"
                      value={cropBox.height}
                      onChange={(e) => setCropBox({ ...cropBox, height: Number(e.target.value) })}
                      className="accent-cyan-400"
                    />
                  </label>
                </div>
              </div>
            )}
            <p className="text-xs text-neutral-500">
              💡 Tip: กดปุ่ม Preset ด้านบน หรือเลื่อนปรับกรอบสีฟ้าให้ครอบ **เฉพาะหน้าจอ LCD ที่มีตัวเลข** (หลีกเลี่ยงลายผ้าปูเตียงหรือปุ่มกด)
            </p>
          </div>
        )}

        <div className="relative flex flex-col md:flex-row items-center justify-center gap-6 rounded-lg border border-neutral-800 bg-black/50 p-6 overflow-hidden">
          {uploadedFile ? (
            <>
              <div className="relative max-h-72">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={URL.createObjectURL(uploadedFile)} alt="Uploaded display" className="max-h-72 rounded block" />
                {useCrop && (
                  <div
                    className="absolute pointer-events-none border-2 border-cyan-400 bg-cyan-400/15 transition-all rounded shadow-sm shadow-cyan-400/50"
                    style={{
                      top: `${cropBox.top}%`,
                      left: `${cropBox.left}%`,
                      width: `${cropBox.width}%`,
                      height: `${cropBox.height}%`,
                    }}
                  >
                    <span className="absolute -top-5 left-0 rounded bg-cyan-500 px-1 text-[10px] font-mono text-black font-bold whitespace-nowrap">
                      LCD Area
                    </span>
                  </div>
                )}
              </div>

              {useCrop && (
                <div className="flex flex-col items-center gap-1.5 rounded-lg border border-cyan-800/40 bg-neutral-900/80 p-3 text-center">
                  <span className="text-[11px] font-medium text-cyan-300">🔍 สิ่งที่ระบบจะอ่าน (Zoomed LCD):</span>
                  <div
                    className="relative overflow-hidden rounded border border-neutral-700 bg-black"
                    style={{ width: "140px", height: "140px" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={URL.createObjectURL(uploadedFile)}
                      alt="Zoomed crop"
                      className="absolute max-w-none pointer-events-none"
                      style={{
                        width: `${(100 / Math.max(1, cropBox.width)) * 140}px`,
                        height: `${(100 / Math.max(1, cropBox.height)) * 140}px`,
                        top: `-${(cropBox.top / Math.max(1, cropBox.height)) * 140}px`,
                        left: `-${(cropBox.left / Math.max(1, cropBox.width)) * 140}px`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-neutral-400">ตรวจสอบให้เห็นตัวเลขชัดในช่องนี้</span>
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
        className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-cyan-400 disabled:opacity-50"
      >
        {loading ? "Analyzing dual witnesses..." : "Analyze"}
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

          <div className={`rounded-lg border p-4 ${STATUS_STYLE[data.result.status]}`}>
            <p className="text-xs uppercase tracking-wide opacity-70">{data.result.status}</p>
            <p className="text-2xl font-semibold">{data.result.consensus ?? "unresolved"}</p>
            <p className="mt-1 text-sm opacity-80">
              confidence {(data.result.confidence * 100).toFixed(0)}%
              {data.result.needsHumanReview && " — flagged for human review"}
            </p>

            {/* Blood pressure / multi-row parameter breakdown */}
            {data.extractedLines && data.extractedLines.length >= 2 && (
              <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded bg-black/20 p-1.5">
                  <div className="text-neutral-400 font-medium">SYS (บน)</div>
                  <div className="text-sm font-bold text-white">{data.extractedLines[0] || "—"}</div>
                  <div className="text-[10px] text-neutral-400">mmHg</div>
                </div>
                <div className="rounded bg-black/20 p-1.5">
                  <div className="text-neutral-400 font-medium">DIA (กลาง)</div>
                  <div className="text-sm font-bold text-white">{data.extractedLines[1] || "—"}</div>
                  <div className="text-[10px] text-neutral-400">mmHg</div>
                </div>
                <div className="rounded bg-black/20 p-1.5">
                  <div className="text-neutral-400 font-medium">PULSE (ชีพจร)</div>
                  <div className="text-sm font-bold text-white">{data.extractedLines[2] || "—"}</div>
                  <div className="text-[10px] text-neutral-400">bpm</div>
                </div>
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

interface DocumentAnalyzeResult {
  witnessA: TextWitnessResult;
  witnessB: TextWitnessResult;
  markdownA: string;
  markdownB: string;
  result: TextConsensusResult;
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
  const [activeView, setActiveView] = useState<"formatted" | "raw">("formatted");
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

      setData({
        witnessA: wa,
        witnessB: wb,
        markdownA: linesToMarkdown(witnessA.lines),
        markdownB: linesToMarkdown(witnessB.lines),
        result: reconcileTextWitnesses(wa, wb),
      });
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
            twice using distinct page segmentation modes (PSM): AUTO (automatic block layout analysis) and SPARSE_TEXT
            (scattered text detection).
          </p>
          <p>
            Includes a dedicated **Thai OCR Normalizer** that cleans floating vowels (สระลอย), displaced tone marks (วรรณยุกต์หลุด),
            and broken word spacings (e.g. slips, invoices, receipts).
          </p>
        </div>
      </details>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-neutral-300">1. Upload an image (Documents, Slips, UI)</h2>
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
        className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-cyan-400 disabled:opacity-50"
      >
        {loading ? progress?.status ?? "Reading text..." : "Analyze Document"}
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
            <p className="text-xs uppercase tracking-wide opacity-70">{data.result.status}</p>
            <p className="mt-1 text-sm opacity-80">
              similarity {(data.result.similarity * 100).toFixed(0)}% · confidence{" "}
              {(data.result.confidence * 100).toFixed(0)}%
              {data.result.needsHumanReview && " — flagged for human review"}
            </p>
          </div>

          {resolvedMarkdown !== null ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveView("formatted")}
                    className={`text-xs px-3 py-1 rounded transition ${
                      activeView === "formatted"
                        ? "bg-cyan-500/20 text-cyan-300 font-medium"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    ✨ Formatted Preview
                  </button>
                  <button
                    onClick={() => setActiveView("raw")}
                    className={`text-xs px-3 py-1 rounded transition ${
                      activeView === "raw"
                        ? "bg-cyan-500/20 text-cyan-300 font-medium"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    Raw Markdown
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => copyToClipboard(resolvedMarkdown)}
                    className="text-xs text-neutral-300 hover:text-cyan-300 border border-neutral-700 px-2.5 py-1 rounded transition"
                  >
                    {copied ? "✓ Copied!" : "Copy Text"}
                  </button>
                  <button
                    onClick={() => downloadMarkdown(resolvedMarkdown)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-800/60 bg-cyan-950/40 px-2.5 py-1 rounded transition"
                  >
                    Download .md
                  </button>
                </div>
              </div>

              {activeView === "formatted" ? (
                <RenderedMarkdownViewer markdown={resolvedMarkdown} />
              ) : (
                <textarea
                  readOnly
                  value={resolvedMarkdown || "(no text detected)"}
                  rows={12}
                  className="w-full resize-y rounded-md border border-neutral-800 bg-neutral-900 p-3 font-mono text-xs text-neutral-300"
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
 * Renders structured Markdown with clean typography, key-value badge layout,
 * and high readability for Thai text and slips.
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
