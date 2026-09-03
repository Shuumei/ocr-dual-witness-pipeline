import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { reconcileWitnesses } from "@/lib/consensus";
import { readWitness } from "@/lib/witness";

export const runtime = "nodejs";

const WITNESS_A_MODEL = process.env.ANTHROPIC_WITNESS_A_MODEL ?? "claude-haiku-4-5-20251001";
const WITNESS_B_MODEL = process.env.ANTHROPIC_WITNESS_B_MODEL ?? "claude-sonnet-5";

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
      readWitness(client, WITNESS_A_MODEL, "witness-a", imageBase64, mimeType),
      readWitness(client, WITNESS_B_MODEL, "witness-b", imageBase64, mimeType),
    ]);

    const result = reconcileWitnesses(witnessA, witnessB);

    return NextResponse.json({ witnessA, witnessB, result });
  } catch (error) {
    console.error("read-meter failed", error);
    return NextResponse.json({ error: "Vision API call failed." }, { status: 502 });
  }
}
