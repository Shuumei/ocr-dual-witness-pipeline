import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { reconcileWitnesses } from "@/lib/consensus";
import { readWitness } from "@/lib/witness";

export const runtime = "nodejs";

// Two calls to the same model, not two different models: an earlier version paired
// claude-haiku with claude-sonnet as a cheap/strong tier, but Haiku's vision could not
// read this synthetic 7-segment font at all (100% empty readings across repeated tests).
// claude-sonnet-5 also rejects the `temperature` param, so witness diversity comes
// entirely from asking the same model to read the image two different ways -- see
// README "Design notes".
const WITNESS_MODEL = process.env.ANTHROPIC_WITNESS_MODEL ?? "claude-sonnet-5";

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

function isAllowedMimeType(value: unknown): value is AllowedMimeType {
  return typeof value === "string" && (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const imageBase64 = body?.imageBase64;
  const mimeType = body?.mimeType;

  if (typeof imageBase64 !== "string" || imageBase64.length === 0 || !isAllowedMimeType(mimeType)) {
    return NextResponse.json(
      { error: "Request must include imageBase64 (string) and mimeType (image/png|jpeg|webp)." },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });

  try {
    const [witnessA, witnessB] = await Promise.all([
      readWitness(client, WITNESS_MODEL, "witness-a", imageBase64, mimeType, { prompt: "direct" }),
      readWitness(client, WITNESS_MODEL, "witness-b", imageBase64, mimeType, {
        prompt: "segment-by-segment",
      }),
    ]);

    const result = reconcileWitnesses(witnessA, witnessB);

    return NextResponse.json({ witnessA, witnessB, result });
  } catch (error) {
    console.error("read-meter failed", error);
    return NextResponse.json({ error: "Vision API call failed." }, { status: 502 });
  }
}
