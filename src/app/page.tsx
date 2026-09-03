"use client";

import { useRef, useState } from "react";
import { SevenSegmentDisplay } from "@/components/SevenSegmentDisplay";
import { reconcileWitnesses, type ConsensusResult, type WitnessReading } from "@/lib/consensus";
import { decodeDisplay, decodeDisplayAutoAlign, type PixelSource, type Polarity } from "@/lib/imageDecoder";
import { getSvgPixels } from "@/lib/getSvgPixels";
import { getImagePixels } from "@/lib/getImagePixels";
import { detectContent } from "@/lib/cropToContent";
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

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16 text-neutral-100">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">OCR Dual-Witness Consensus Engine</h1>
        <p className="text-sm text-neutral-400">
          Two independent, differently-configured OCR passes read the same image, entirely in
          your browser. They agree, we trust it. They disagree, we flag it for a human instead of
          guessing. No AI vision API, no server call, no company money spent.
        </p>
      </header>

      <div className="flex gap-2 border-b border-neutral-800">
        <ModeTab active={mode === "meter"} onClick={() => setMode("meter")}>
          Meter reading (7-segment)
        </ModeTab>
        <ModeTab active={mode === "document"} onClick={() => setMode("document")}>
          Document / UI (general OCR)
        </ModeTab>
      </div>

      {mode === "meter" ? <MeterMode /> : <DocumentMode />}
    </main>
  );
}

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
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
}

function runMeterWitnesses(pixels: PixelSource, polarity: Polarity, autoAlign: boolean): MeterAnalyzeResult {
  const decode = autoAlign ? decodeDisplayAutoAlign : decodeDisplay;
  const a = decode(pixels, { sampleMode: "point", thresholdMode: "fixed", polarity, startMargin: 4 });
  const b = decode(pixels, { sampleMode: "region", thresholdMode: "adaptive", polarity, startMargin: 4 });
  const witnessA: WitnessReading = { raw: a.reading, confidence: a.confidence, witness: "witness-a" };
  const witnessB: WitnessReading = { raw: b.reading, confidence: b.confidence, witness: "witness-b" };
  return { witnessA, witnessB, result: reconcileWitnesses(witnessA, witnessB) };
}

function MeterMode() {
  const [selectedSampleId, setSelectedSampleId] = useState(SAMPLE_METERS[0].id);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MeterAnalyzeResult | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const selectedSample = SAMPLE_METERS.find((m) => m.id === selectedSampleId)!;

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      if (uploadedFile) {
        const raw = await getImagePixels(uploadedFile);
        const detected = detectContent(raw);
        if (!detected) {
          throw new Error(
            "Couldn't find a display-like region in this image (needs clear contrast between the digits and their background)."
          );
        }
        setData(runMeterWitnesses(detected.pixels, detected.polarity, true));
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
            position the engine checks two fixed points (where a 7-segment digit&apos;s left and
            right vertical bars would be) — every digit 0-9 lights at least one of them, so this
            is how it finds where digits start and stop.
          </p>
          <p>
            When a digit is found, it samples brightness at all 7 segment locations, thresholds
            each to on/off, and looks the resulting pattern up in a table (e.g.{" "}
            <code className="rounded bg-neutral-800 px-1">{"{a,b,c,d,e,f}"}</code> → 0). The two
            witnesses differ only in <em>how</em> they sample: Witness A reads a single pixel per
            segment against a fixed threshold; Witness B averages a 3×3 region per segment against
            a threshold recalibrated to that image&apos;s own brightness range.
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
              onChange={(e) => setUploadedFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {uploadedFile && (
          <p className="text-xs text-amber-400/80">
            Experimental: this engine is tuned to its own generated 7-segment proportions. Photos
            of real hardware often use different segment ratios and won&apos;t decode correctly —
            that&apos;s an expected, disclosed limit, not a bug. Uploading a photo of anything
            other than a digit display (a screenshot, a document) belongs in the{" "}
            <strong>Document / UI</strong> tab above instead.
          </p>
        )}

        <div className="flex justify-center rounded-lg border border-neutral-800 p-6">
          {uploadedFile ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={URL.createObjectURL(uploadedFile)} alt="Uploaded image" className="max-h-60 rounded" />
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
        {loading ? "Reading with two witnesses..." : "Analyze"}
      </button>

      {error && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">{error}</p>
      )}

      {data && (
        <section className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <MeterWitnessCard label="Witness A · point-sample / fixed threshold" reading={data.witnessA} />
            <MeterWitnessCard label="Witness B · region-average / adaptive threshold" reading={data.witnessB} />
          </div>

          <div className={`rounded-lg border p-4 ${STATUS_STYLE[data.result.status]}`}>
            <p className="text-xs uppercase tracking-wide opacity-70">{data.result.status}</p>
            <p className="text-2xl font-semibold">{data.result.consensus ?? "unresolved"}</p>
            <p className="mt-1 text-sm opacity-80">
              confidence {(data.result.confidence * 100).toFixed(0)}%
              {data.result.needsHumanReview && " — flagged for human review"}
            </p>
          </div>
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

function DocumentMode() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DocumentAnalyzeResult | null>(null);

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

  function downloadMarkdown(text: string) {
    const blob = new Blob([text], { type: "text/markdown" });
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
            This mode runs <a className="underline" href="https://github.com/naptha/tesseract.js">Tesseract.js</a> —
            a real, open-source OCR engine (WASM build of Tesseract) — twice on the same image,
            with two different page-segmentation strategies: one lets Tesseract find its own text
            blocks, the other treats the image as scattered, unstructured text. On a clean
            document the two usually agree; on a busy UI screenshot with icons and short labels
            they often don&apos;t, which is exactly the case worth flagging.
          </p>
          <p>
            Markdown isn&apos;t generated by a model — each OCR line&apos;s pixel height is
            compared against the page&apos;s median line height: much taller → <code className="rounded bg-neutral-800 px-1"># heading</code>,
            moderately taller → <code className="rounded bg-neutral-800 px-1">## heading</code>, a
            leading bullet glyph → a list item, everything else → paragraph text. It&apos;s
            mechanical layout heuristics, not document understanding, and it shows.
          </p>
          <p className="text-amber-400/80">
            Unlike the meter-reading mode, this one isn&apos;t fully self-contained: Tesseract.js
            downloads its language model files (~a few MB, English + Thai) from a public CDN on
            first use. Still no API key, no account, no company money spent — just a one-time,
            unauthenticated file download.
          </p>
        </div>
      </details>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-neutral-300">1. Upload an image</h2>
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
          <div className="flex justify-center rounded-lg border border-neutral-800 p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={URL.createObjectURL(file)} alt="Uploaded document" className="max-h-72 rounded" />
          </div>
        )}
      </section>

      <button
        onClick={handleAnalyze}
        disabled={loading || !file}
        className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-cyan-400 disabled:opacity-50"
      >
        {loading ? progress?.status ?? "Working..." : "Analyze"}
      </button>
      {loading && progress && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full bg-cyan-500 transition-all"
            style={{ width: `${Math.round(progress.progress * 100)}%` }}
          />
        </div>
      )}

      {error && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">{error}</p>
      )}

      {data && (
        <section className="flex flex-col gap-4">
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
            <MarkdownOutput title="Markdown output" markdown={resolvedMarkdown} onDownload={() => downloadMarkdown(resolvedMarkdown)} />
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-red-400">
                Witnesses disagree — showing both instead of picking one to trust.
              </p>
              <MarkdownOutput title="Witness A output" markdown={data.markdownA} onDownload={() => downloadMarkdown(data.markdownA)} />
              <MarkdownOutput title="Witness B output" markdown={data.markdownB} onDownload={() => downloadMarkdown(data.markdownB)} />
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

function MarkdownOutput({ title, markdown, onDownload }: { title: string; markdown: string; onDownload: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-300">{title}</h3>
        <button onClick={onDownload} className="text-xs text-cyan-400 hover:text-cyan-300">
          Download .md
        </button>
      </div>
      <textarea
        readOnly
        value={markdown || "(no text found)"}
        rows={10}
        className="w-full resize-y rounded-md border border-neutral-800 bg-neutral-900 p-3 font-mono text-xs text-neutral-300"
      />
    </div>
  );
}
