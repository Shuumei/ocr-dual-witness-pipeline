import Anthropic from "@anthropic-ai/sdk";
import type { WitnessReading } from "./consensus";

const JSON_INSTRUCTION = `Reply with ONLY a JSON object, no prose, no markdown fences, in this exact shape:
{"reading": "<digits and decimal point exactly as shown, e.g. 182.4>", "confidence": <number between 0 and 1>}
If you cannot make out any digits, use "reading": "" and "confidence": 0.`;

export const WITNESS_PROMPTS = {
  direct: `You are reading a digital display (7-segment LED/LCD style meter or calculator screen) in the attached image. Read the digits directly, left to right.\n${JSON_INSTRUCTION}`,
  "segment-by-segment": `You are reading a digital display (7-segment LED/LCD style meter or calculator screen) in the attached image. Before answering, mentally check each digit position one at a time -- which segments are lit vs unlit -- rather than pattern-matching the whole number at a glance.\n${JSON_INSTRUCTION}`,
} as const;

export type WitnessPrompt = keyof typeof WITNESS_PROMPTS;

export async function readWitness(
  client: Anthropic,
  model: string,
  witnessName: string,
  imageBase64: string,
  mimeType: "image/png" | "image/jpeg" | "image/webp",
  options: { prompt: WitnessPrompt }
): Promise<WitnessReading> {
  const response = await client.messages.create({
    model,
    max_tokens: 300,
    thinking: { type: "disabled" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
          { type: "text", text: WITNESS_PROMPTS[options.prompt] },
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
