"use client";

import { useRef, useState } from "react";
import { SevenSegmentDisplay } from "@/components/SevenSegmentDisplay";
import { reconcileWitnesses, type ConsensusResult, type WitnessReading } from "@/lib/consensus";
import { decodeDisplay, decodeDisplayAutoAlign, type PixelSource, type Polarity } from "@/lib/imageDecoder";
import { getSvgPixels } from "@/lib/getSvgPixels";
import { getImagePixels } from "@/lib/getImagePixels";
import { detectContent } from "@/lib/cropToContent";
import { SAMPLE_METERS } from "@/lib/samples";

const STATUS_STYLE: Record<ConsensusResult["status"], string> = {
  agree: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  "partial-agreement": "bg-amber-500/15 text-amber-400 border-amber-500/40",
  disagreement: "bg-red-500/15 text-red-400 border-red-500/40",
};

interface AnalyzeResult {
  witnessA: WitnessReading;
  witnessB: WitnessReading;
  result: ConsensusResult;
}

function runWitnesses(pixels: PixelSource, polarity: Polarity, autoAlign: boolean): AnalyzeResult {
  const decode = autoAlign ? decodeDisplayAutoAlign : decodeDisplay;
  const a = decode(pixels, { sampleMode: "point", thresholdMode: "fixed", polarity, startMargin: 4 });
  const b = decode(pixels, { sampleMode: "region", thresholdMode: "adaptive", polarity, startMargin: 4 });
  const witnessA: WitnessReading = { raw: a.reading, confidence: a.confidence, witness: "witness-a" };
  const witnessB: WitnessReading = { raw: b.reading, confidence: b.confidence, witness: "witness-b" };
  return { witnessA, witnessB, result: reconcileWitnesses(witnessA, witnessB) };
}

export default function Home() {
  const [selectedSampleId, setSelectedSampleId] = useState(SAMPLE_METERS[0].id);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResult | null>(null);
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
        setData(runWitnesses(detected.pixels, detected.polarity, true));
      } else {
        if (!svgRef.current) throw new Error("No sample rendered yet.");
        const pixels = await getSvgPixels(svgRef.current);
        setData(runWitnesses(pixels, "light-on-dark", false));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16 text-neutral-100">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">OCR Dual-Witness Consensus Engine</h1>
        <p className="text-sm text-neutral-400">
          Two independent pixel-decoding algorithms read the same display, entirely in your
          browser. They agree, we trust it. They disagree, we flag it for a human instead of
          guessing. No AI API, no server call, no cost.
        </p>
        <details className="mt-1 rounded-md border border-neutral-800 bg-neutral-900/50 text-sm text-neutral-400 open:pb-3">
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
              witnesses differ only in{" "}
              <em>how</em> they sample: Witness A reads a single pixel per segment against a fixed
              threshold; Witness B averages a 3×3 region per segment against a threshold
              recalibrated to that image&apos;s own brightness range — slower, but it survives the
              kind of localized noise that flips a single point-sample.
            </p>
          </div>
        </details>
      </header>

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
            that&apos;s an expected, disclosed limit, not a bug.
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
        <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {data && (
        <section className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <WitnessCard label="Witness A · point-sample / fixed threshold" reading={data.witnessA} />
            <WitnessCard label="Witness B · region-average / adaptive threshold" reading={data.witnessB} />
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
    </main>
  );
}

function WitnessCard({ label, reading }: { label: string; reading: WitnessReading }) {
  return (
    <div className="rounded-lg border border-neutral-800 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-lg font-mono">{reading.raw || "—"}</p>
      <p className="text-xs text-neutral-500">confidence {(reading.confidence * 100).toFixed(0)}%</p>
    </div>
  );
}
