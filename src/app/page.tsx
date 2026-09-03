"use client";

import { useRef, useState } from "react";
import { SevenSegmentDisplay } from "@/components/SevenSegmentDisplay";
import { reconcileWitnesses, type ConsensusResult, type WitnessReading } from "@/lib/consensus";
import { decodeDisplay } from "@/lib/imageDecoder";
import { getSvgPixels } from "@/lib/getSvgPixels";
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

export default function Home() {
  const [selectedSampleId, setSelectedSampleId] = useState(SAMPLE_METERS[0].id);
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
      if (!svgRef.current) throw new Error("No sample rendered yet.");
      const pixels = await getSvgPixels(svgRef.current);

      const a = decodeDisplay(pixels, { sampleMode: "point", thresholdMode: "fixed" });
      const b = decodeDisplay(pixels, { sampleMode: "region", thresholdMode: "adaptive" });

      const witnessA: WitnessReading = { raw: a.reading, confidence: a.confidence, witness: "witness-a" };
      const witnessB: WitnessReading = { raw: b.reading, confidence: b.confidence, witness: "witness-b" };
      setData({ witnessA, witnessB, result: reconcileWitnesses(witnessA, witnessB) });
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
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-neutral-300">1. Pick a sample</h2>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_METERS.map((meter) => (
            <button
              key={meter.id}
              onClick={() => setSelectedSampleId(meter.id)}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                selectedSampleId === meter.id
                  ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                  : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
              }`}
            >
              {meter.label}
            </button>
          ))}
        </div>

        <div className="flex justify-center rounded-lg border border-neutral-800 p-6">
          <SevenSegmentDisplay ref={svgRef} meter={selectedSample} />
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
