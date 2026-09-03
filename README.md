# OCR Dual-Witness Consensus Engine

Reading a 7-segment digit off a low-quality photo (glare, blur, bad angle) is exactly where a single
vision model call quietly hallucinates a digit — a `7` misread as `1`, a `8` misread as `0` — with no
signal that anything went wrong. This demo cross-checks every reading against a second, independent
model call and only trusts the result when both witnesses agree; disagreement gets flagged for a
human instead of silently returned as fact.

This is a clean-room reimplementation of the *dual-witness consensus* pattern used in production in
[Unyna](https://unyna.unyhub.org) (a LINE health assistant that reads medical meter displays). No
code, data, or real health readings from that codebase were used — the consensus algorithm here was
written from scratch, and the sample "meters" are procedurally generated SVGs, not photos.

## How it works

```mermaid
flowchart LR
    A[Photo / mock 7-seg display] --> B[/api/read-meter/]
    B --> C["Witness A\nclaude-sonnet-5, direct-read prompt"]
    B --> D["Witness B\nclaude-sonnet-5, segment-by-segment prompt"]
    C --> E[reconcileWitnesses]
    D --> E
    E -->|exact match| F[✅ agree\nconfidence boosted]
    E -->|minor mismatch, high overlap| G[⚠️ partial-agreement\nflagged for review]
    E -->|major mismatch / different length| H[❌ disagreement\nno reading trusted]
```

Two calls to the same vision model, prompted two different ways, independently read the same image.
Their raw readings are reconciled by a pure function, [`reconcileWitnesses`](src/lib/consensus.ts):

- **Exact match** → `agree`, confidence gets boosted (capped at 0.99 — two witnesses agreeing is
  strong evidence, never treated as certainty).
- **Same length, mostly matching characters** (≥75% by default) → `partial-agreement`. The
  higher-confidence witness's reading is surfaced, but always flagged `needsHumanReview`.
- **Different lengths, or too many mismatched characters** → `disagreement`. No reading is returned —
  better to say "unresolved" than guess.

## Try it

Live demo: _(add your Vercel URL after deploying)_

1. Pick one of three procedurally-generated sample displays (clean / glare / blurry) — each rendered
   live as inline SVG, no image assets committed — or upload your own photo of any digital display.
2. Click **Analyze**. The image is sent to a Next.js API route, never directly to the LLM from the
   browser (the API key never touches the client).
3. See both witnesses' raw readings and the reconciled consensus, color-coded by status.

## Run it yourself

```bash
git clone https://github.com/Shuumei/ocr-dual-witness-pipeline.git
cd ocr-dual-witness-pipeline
npm install
cp .env.example .env.local   # add your own ANTHROPIC_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without an API key, the sample UI still renders
and `npm run test` still runs — the consensus logic itself has no external dependency.

## Tests

The consensus/confidence-gating logic and the vision-response parser are pure functions, unit-tested
independently of any network call:

```
npm run test

 ✓ src/lib/consensus.test.ts  (8 tests)
 ✓ src/lib/witness.test.ts    (5 tests)

 Test Files  2 passed (2)
      Tests  13 passed (13)
```

Covers: exact-match agreement with confidence boost (capped at 0.99), the classic single-digit
7-vs-1 misread as partial agreement, full disagreement, mismatched-length readings, empty readings,
a custom threshold, and malformed/markdown-wrapped model output.

## Tech stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- Anthropic SDK (`@anthropic-ai/sdk`) — two witness calls per request, server-side only
- Vitest for unit tests
- Deployed on Vercel

## Design notes

- **No client-side API key.** All vision calls happen in `src/app/api/read-meter/route.ts`, a
  server-only Next.js route.
- **Why both witnesses use the same model.** The first version paired `claude-haiku-4-5` (cheap/fast)
  against `claude-sonnet-5` (stronger) as a tiered pair. In testing, Haiku returned an empty reading
  100% of the time on this synthetic 7-segment font — it isn't a capable-enough OCR reader for this
  input, so a "cheap vs. strong" pairing collapsed into "broken vs. working" instead of two genuine
  witnesses. `claude-sonnet-5` also rejects the `temperature` parameter outright, so witness diversity
  here comes from two different prompt framings (read digits directly, vs. check each digit's segments
  individually) rather than model choice or sampling temperature.
- **Known limitation: agreement isn't proof.** If both calls share the same underlying model, a visual
  ambiguity that fools one prompt framing can fool the other the same way — agreement raises confidence,
  it doesn't guarantee correctness. This surfaced directly during testing: an earlier, wider glare overlay
  obscured enough of a "7" that both witnesses confidently agreed on "18.2" instead of "178.2" (the
  overlay was narrowed until both readings became correct again — see git history). A production system
  wants witnesses with genuinely uncorrelated failure modes (different model vendors, or a second sensor
  entirely), not just two prompts against one model.
- **Sample images are generated, not photographed.** `src/components/SevenSegmentDisplay.tsx` draws a
  real 7-segment digit layout as SVG rectangles and applies an SVG blur/glare filter for the degraded
  samples — no external image files, no real hardware, no health data. Only lit segments are drawn (no
  "ghost" outline for unlit ones) — an earlier version with dim ghost segments made every digit look
  partially like an "8" to the vision model and caused misreads.
- **Sample rasterization is scaled 12x.** The SVG viewBox is a few hundred units across; exporting the
  canvas at that raw size produced a ~144x78px PNG that was too small for the model to read reliably.
