import 'server-only'

import {
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  Modality,
  ThinkingLevel,
  type Content,
  type GenerateContentConfig,
  type Part,
} from '@google/genai'

import { AiError, classifyProviderError } from '@/lib/ai/errors'
import { env } from '@/lib/env'

/**
 * Tanki omotač oko @google/genai SDK-a. Bez retry/fallback logike (to radi
 * orchestration sloj), ali sa timeout-om, safety podešavanjima, strukturisanim
 * JSON izlazom i prepoznavanjem safety blokade.
 */
let clientSingleton: GoogleGenAI | null = null

export function getGeminiClient(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) {
    throw new AiError('NOT_CONFIGURED', 'GEMINI_API_KEY nije podešen.')
  }
  clientSingleton ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
  return clientSingleton
}

/** Za testove: resetuje singleton (npr. posle promene env-a). */
export function resetGeminiClient(): void {
  clientSingleton = null
}

const SAFETY = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE }))

export interface ImageInput {
  /** base64 bez data: prefiksa */
  data: string
  mimeType: string
}

export interface TextRequest {
  model: string
  system?: string
  prompt: string
  images?: ImageInput[]
  /** JSON šema izlaza (npr. iz z.toJSONSchema); uključuje application/json */
  jsonSchema?: Record<string, unknown>
  maxOutputTokens?: number
  temperature?: number
  thinking?: 'minimal' | 'low' | 'medium' | 'high'
  timeoutMs?: number
}

export interface UsageSummary {
  inputTokens: number
  outputTokens: number
  thoughtTokens: number
  totalTokens: number
}

export interface TextResult {
  text: string
  json: unknown
  usage: UsageSummary
  model: string
  durationMs: number
  finishReason: string | null
}

const THINKING: Record<NonNullable<TextRequest['thinking']>, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
}

interface UsageLike {
  promptTokenCount?: number
  candidatesTokenCount?: number
  thoughtsTokenCount?: number
  totalTokenCount?: number
}

function summarizeUsage(meta: UsageLike | undefined): UsageSummary {
  return {
    inputTokens: meta?.promptTokenCount ?? 0,
    outputTokens: meta?.candidatesTokenCount ?? 0,
    thoughtTokens: meta?.thoughtsTokenCount ?? 0,
    totalTokens: meta?.totalTokenCount ?? 0,
  }
}

function userContent(prompt: string, images?: ImageInput[]): Content[] {
  const parts: Part[] = []
  for (const img of images ?? []) parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } })
  parts.push({ text: prompt })
  return [{ role: 'user', parts }]
}

interface ResponseLike {
  text?: string
  candidates?: Array<{ finishReason?: string; content?: { parts?: Part[] } }>
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string }
  usageMetadata?: UsageLike
}

function assertNotBlocked(response: ResponseLike, model: string): void {
  const block = response.promptFeedback?.blockReason
  if (block && block !== 'BLOCK_REASON_UNSPECIFIED' && block !== 'BLOCKED_REASON_UNSPECIFIED') {
    throw new AiError('SAFETY_BLOCKED', `Ulaz je blokiran (${block}).`, { model })
  }
  const finish = response.candidates?.[0]?.finishReason
  if (
    finish === 'SAFETY' ||
    finish === 'PROHIBITED_CONTENT' ||
    finish === 'BLOCKLIST' ||
    finish === 'SPII' ||
    finish === 'IMAGE_SAFETY'
  ) {
    throw new AiError('SAFETY_BLOCKED', `Izlaz je blokiran (${finish}).`, { model })
  }
}

export async function generateText(req: TextRequest): Promise<TextResult> {
  const ai = getGeminiClient()
  const started = Date.now()
  const config: GenerateContentConfig = {
    systemInstruction: req.system,
    temperature: req.temperature ?? 0.7,
    maxOutputTokens: req.maxOutputTokens ?? 4096,
    safetySettings: SAFETY,
    httpOptions: { timeout: req.timeoutMs ?? 30_000 },
    thinkingConfig: { thinkingLevel: THINKING[req.thinking ?? 'low'] },
  }
  if (req.jsonSchema) {
    config.responseMimeType = 'application/json'
    config.responseJsonSchema = req.jsonSchema
  }
  let response: ResponseLike
  try {
    response = (await ai.models.generateContent({
      model: req.model,
      contents: userContent(req.prompt, req.images),
      config,
    })) as unknown as ResponseLike
  } catch (error) {
    throw classifyProviderError(error, req.model)
  }
  assertNotBlocked(response, req.model)
  const text = response.text ?? ''
  let json: unknown = null
  if (req.jsonSchema) {
    try {
      json = JSON.parse(text)
    } catch {
      throw new AiError('INVALID_RESPONSE', 'Model nije vratio ispravan JSON.', {
        retryable: true,
        model: req.model,
      })
    }
  }
  if (!req.jsonSchema && !text.trim()) {
    throw new AiError('INVALID_RESPONSE', 'Model je vratio prazan odgovor.', {
      retryable: true,
      model: req.model,
    })
  }
  return {
    text,
    json,
    usage: summarizeUsage(response.usageMetadata),
    model: req.model,
    durationMs: Date.now() - started,
    finishReason: response.candidates?.[0]?.finishReason ?? null,
  }
}

export type AspectRatio = '1:1' | '4:5' | '3:4' | '9:16' | '16:9' | '4:3' | '3:2' | '2:3' | '21:9'
export type ImageSize = '1K' | '2K' | '4K'

export interface ImageRequest {
  model: string
  prompt: string
  inputImages?: ImageInput[]
  aspectRatio?: AspectRatio
  imageSize?: ImageSize
  timeoutMs?: number
}

export interface ImageResult {
  imageBase64: string
  mimeType: string
  text: string | null
  usage: UsageSummary
  model: string
  durationMs: number
}

export async function generateImage(req: ImageRequest): Promise<ImageResult> {
  const ai = getGeminiClient()
  const started = Date.now()
  const config: GenerateContentConfig = {
    responseModalities: [Modality.IMAGE, Modality.TEXT],
    imageConfig: { aspectRatio: req.aspectRatio ?? '1:1', imageSize: req.imageSize ?? '1K' },
    safetySettings: SAFETY,
    httpOptions: { timeout: req.timeoutMs ?? 90_000 },
  }
  let response: ResponseLike
  try {
    response = (await ai.models.generateContent({
      model: req.model,
      contents: userContent(req.prompt, req.inputImages),
      config,
    })) as unknown as ResponseLike
  } catch (error) {
    throw classifyProviderError(error, req.model)
  }
  assertNotBlocked(response, req.model)
  const parts = response.candidates?.[0]?.content?.parts ?? []
  const image = parts.find((p) => p.inlineData?.data)
  if (!image?.inlineData?.data) {
    throw new AiError('INVALID_RESPONSE', 'Model nije vratio sliku.', { retryable: true, model: req.model })
  }
  const text =
    parts
      .map((p) => p.text)
      .filter(Boolean)
      .join('\n') || null
  return {
    imageBase64: image.inlineData.data,
    mimeType: image.inlineData.mimeType ?? 'image/png',
    text,
    usage: summarizeUsage(response.usageMetadata),
    model: req.model,
    durationMs: Date.now() - started,
  }
}

export interface EmbedRequest {
  model: string
  texts: string[]
  dimensions?: number
  taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'SEMANTIC_SIMILARITY' | 'CLASSIFICATION'
  timeoutMs?: number
}

export async function embedTexts(
  req: EmbedRequest,
): Promise<{ vectors: number[][]; usage: UsageSummary; model: string }> {
  const ai = getGeminiClient()
  try {
    const response = await ai.models.embedContent({
      model: req.model,
      // svaki tekst kao poseban Content: niz stringova bi SDK spojio u jedan sadržaj sa više delova
      contents: req.texts.map((text) => ({ role: 'user', parts: [{ text }] })),
      config: {
        outputDimensionality: req.dimensions ?? 1536,
        taskType: req.taskType ?? 'RETRIEVAL_DOCUMENT',
        httpOptions: { timeout: req.timeoutMs ?? 30_000 },
      },
    })
    const vectors = (response.embeddings ?? []).map((e) => e.values ?? [])
    if (vectors.length !== req.texts.length) {
      throw new AiError('INVALID_RESPONSE', 'Broj embeddinga ne odgovara broju tekstova.', {
        retryable: true,
        model: req.model,
      })
    }
    const tokens =
      (response.metadata as { billableCharacterCount?: number } | undefined)?.billableCharacterCount ?? 0
    return {
      vectors,
      usage: { inputTokens: tokens, outputTokens: 0, thoughtTokens: 0, totalTokens: tokens },
      model: req.model,
    }
  } catch (error) {
    throw classifyProviderError(error, req.model)
  }
}
