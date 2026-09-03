"use client";

import { useRef, useState } from "react";
import { SevenSegmentDisplay } from "@/components/SevenSegmentDisplay";
import type { ConsensusResult, WitnessReading } from "@/lib/consensus";
import { fileToBase64, svgToPngBase64 } from "@/lib/svgToPngBase64";
import { SAMPLE_METERS } from "@/lib/samples";

interface ApiResponse {
  witnessA: WitnessReading;
  witnessB: WitnessReading;
  result: ConsensusResult;
}

const STATUS_STYLE: Record<ConsensusResult["status"], string> = {
  agree: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  "partial-agreement": "bg-amber-500/15 text-amber-400 border-amber-500/40",
  disagreement: "bg-red-500/15 text-red-400 border-red-500/40",
};

export default function Home() {
  const [selectedSampleId, setSelectedSampleId] = useState(SAMPLE_METERS[0].id);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const selectedSample = SAMPLE_METERS.find((m) => m.id === selectedSampleId)!;

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      let imageBase64: string;
      let mimeType: string;

      if (uploadedFile) {
        const converted = await fileToBase64(uploadedFile);
        imageBase64 = converted.base64;
        mimeType = converted.mimeType;
      } else {
        if (!svgRef.current) throw new Error("No sample rendered yet.");
        imageBase64 = await svgToPngBase64(svgRef.current);
        mimeType = "image/png";
      }

      const res = await fetch("/api/read-meter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed.");
      setData(json as ApiResponse);
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
          Two independent vision models read the same display. They agree, we trust it. They
          disagree, we flag it for a human instead of guessing.
        </p>
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
          <label className="cursor-pointer rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-400 hover:border-neutral-500">
            Upload your own
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => setUploadedFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <div className="flex justify-center rounded-lg border border-neutral-800 p-6">
          {uploadedFile ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={URL.createObjectURL(uploadedFile)}
              alt="Uploaded meter"
              className="max-h-40 rounded"
            />
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
            <WitnessCard label="Witness A" reading={data.witnessA} />
            <WitnessCard label="Witness B" reading={data.witnessB} />
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
