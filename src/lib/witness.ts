import Anthropic from "@anthropic-ai/sdk";
import type { WitnessReading } from "./consensus";

const PROMPT = `You are reading a digital display (7-segment LED/LCD style meter or calculator screen) in the attached image.
Reply with ONLY a JSON object, no prose, no markdown fences, in this exact shape:
{"reading": "<digits and decimal point exactly as shown, e.g. 182.4>", "confidence": <number between 0 and 1>}
If you cannot make out any digits, use "reading": "" and "confidence": 0.`;

export async function readWitness(
  client: Anthropic,
  model: string,
  witnessName: string,
  imageBase64: string,
  mimeType: "image/png" | "image/jpeg" | "image/webp"
): Promise<WitnessReading> {
  const response = await client.messages.create({
    model,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return parseWitnessResponse(text, witnessName);
}

export function parseWitnessResponse(text: string, witnessName: string): WitnessReading {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return { raw: "", confidence: 0, witness: witnessName };
  }
  try {
    const parsed = JSON.parse(match[0]) as { reading?: unknown; confidence?: unknown };
    const raw = typeof parsed.reading === "string" ? parsed.reading : "";
    const confidenceNum = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    const confidence = Math.min(1, Math.max(0, confidenceNum));
    return { raw, confidence, witness: witnessName };
  } catch {
    return { raw: "", confidence: 0, witness: witnessName };
  }
}
