import "server-only";
import { z } from "zod";
import { getGemini, models } from "@/lib/ai/gemini";
import { AiError, withRetry } from "@/lib/ai/retry";
import { textSystemPrompt, type Business, type Platform } from "@/lib/ai/prompts";

// Tekst za objavu: primarni model do 3 pokušaja, pa rezervni 1 pokušaj.

const TEXT_TIMEOUT_MS = 30_000;

const outputSchema = z.object({
  caption: z.string().min(1).max(3000),
  hashtags: z.array(z.string().min(1).max(60)).max(30).default([]),
  cta: z.string().max(300).default(""),
});

export type TextResult = z.infer<typeof outputSchema> & {
  model: string;
  attempts: number;
  durationMs: number;
};

export type TextInput = {
  business: Business | null;
  prompt: string;
  platform: Platform;
  tone?: string | null;
  language: "sr" | "en";
  image?: { data: string; mimeType: string } | null;
};

export async function generateText(input: TextInput): Promise<TextResult> {
  const started = Date.now();
  let attempts = 0;
  const count = () => {
    attempts += 1;
  };

  const run = (model: string) => () => callModel(model, input);

  try {
    const result = await withRetry(run(models.text), { attempts: 3, label: models.text, onAttempt: count });
    return { ...result, model: models.text, attempts, durationMs: Date.now() - started };
  } catch (e) {
    const err = e as AiError;
    if (err.kind === "rejected") throw err;
    console.warn(`[ai] tekst: primarni ${models.text} pao (${err.kind}: ${err.message}), idem na rezervni ${models.textFallback}`);
    const result = await withRetry(run(models.textFallback), { attempts: 1, label: models.textFallback, onAttempt: count });
    return { ...result, model: models.textFallback, attempts, durationMs: Date.now() - started };
  }
}

async function callModel(model: string, input: TextInput) {
  const ai = getGemini();
  const system = textSystemPrompt({
    business: input.business,
    platform: input.platform,
    tone: input.tone,
    language: input.language,
    hasImage: Boolean(input.image),
  });

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
  if (input.image) parts.push({ inlineData: { data: input.image.data, mimeType: input.image.mimeType } });
  parts.push({ text: `Tema objave:\n${input.prompt}` });

  const res = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          caption: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
          cta: { type: "string" },
        },
        required: ["caption", "hashtags", "cta"],
      },
      temperature: 0.9,
      httpOptions: { timeout: TEXT_TIMEOUT_MS },
    },
  });

  const finish = res.candidates?.[0]?.finishReason;
  if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST" || res.promptFeedback?.blockReason) {
    throw new AiError("rejected", `Model je odbio sadržaj (${finish ?? res.promptFeedback?.blockReason})`, model);
  }

  const raw = (res.text ?? "").trim();
  if (!raw) throw new AiError("retryable", "Prazan odgovor modela", model);

  const parsed = parseJson(raw);
  if (!parsed) {
    // Jedan pokušaj: model vratio tekst bez JSON-a. Spasimo ga kao caption.
    return outputSchema.parse({ caption: raw.slice(0, 3000), hashtags: [], cta: "" });
  }
  const checked = outputSchema.safeParse(parsed);
  if (!checked.success) throw new AiError("retryable", "JSON odgovora nije u očekivanom obliku", model);
  return {
    ...checked.data,
    hashtags: checked.data.hashtags.map((h) => h.replace(/^#+/, "").replace(/\s+/g, "")).filter(Boolean),
  };
}

function parseJson(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
