import "server-only";
import { getGemini, models } from "@/lib/ai/gemini";
import { AiError, withRetry } from "@/lib/ai/retry";
import { imagePrompt, type Business } from "@/lib/ai/prompts";

// Slika iz opisa ili iz fotografije. Jedan poziv traje 40–75 s, pa primarni
// model ima 2 pokušaja (ne 3) i rezervni 1, da ruta stane u maxDuration.

const IMAGE_TIMEOUT_MS = 90_000;

export const ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export type ImageInput = {
  business: Business | null;
  prompt: string;
  aspectRatio: AspectRatio;
  inputImage?: { data: string; mimeType: string } | null;
};

export type ImageResult = {
  buffer: Buffer;
  mimeType: string;
  model: string;
  attempts: number;
  durationMs: number;
};

export async function generateImage(input: ImageInput): Promise<ImageResult> {
  const started = Date.now();
  let attempts = 0;
  const count = () => {
    attempts += 1;
  };
  const run = (model: string) => () => callModel(model, input);

  try {
    const r = await withRetry(run(models.image), { attempts: 2, baseDelayMs: 1000, label: models.image, onAttempt: count });
    return { ...r, model: models.image, attempts, durationMs: Date.now() - started };
  } catch (e) {
    const err = e as AiError;
    if (err.kind === "rejected") throw err;
    console.warn(`[ai] slika: primarni ${models.image} pao (${err.kind}: ${err.message}), idem na rezervni ${models.imageFallback}`);
    const r = await withRetry(run(models.imageFallback), { attempts: 1, label: models.imageFallback, onAttempt: count });
    return { ...r, model: models.imageFallback, attempts, durationMs: Date.now() - started };
  }
}

async function callModel(model: string, input: ImageInput) {
  const ai = getGemini();
  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
  if (input.inputImage) parts.push({ inlineData: { data: input.inputImage.data, mimeType: input.inputImage.mimeType } });
  parts.push({ text: imagePrompt({ business: input.business, prompt: input.prompt, fromPhoto: Boolean(input.inputImage) }) });

  const res = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: input.aspectRatio },
      httpOptions: { timeout: IMAGE_TIMEOUT_MS },
    },
  });

  const cand = res.candidates?.[0];
  const finish = cand?.finishReason;
  if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST" || finish === "IMAGE_SAFETY" || res.promptFeedback?.blockReason) {
    throw new AiError("rejected", `Model je odbio sliku (${finish ?? res.promptFeedback?.blockReason})`, model);
  }

  const img = cand?.content?.parts?.find((p) => p.inlineData?.data);
  if (!img?.inlineData?.data) {
    throw new AiError("retryable", `Odgovor nema sliku (finish=${finish ?? "?"})`, model);
  }

  return {
    buffer: Buffer.from(img.inlineData.data, "base64"),
    mimeType: img.inlineData.mimeType ?? "image/png",
  };
}
