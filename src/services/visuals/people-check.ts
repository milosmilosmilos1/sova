import 'server-only'

import sharp from 'sharp'

import { classifyProviderError } from '@/lib/ai/errors'
import { generateText, type ImageInput } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback } from '@/lib/ai/orchestrator'
import {
  buildPeopleCheckPrompt,
  buildPeopleCheckSystemPrompt,
  peopleCheckJsonSchema,
  peopleCheckSchema,
  verdictAllowed,
} from '@/lib/ai/prompts/people-check'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { mapLimit } from '@/lib/map-limit'
import { safeFetch } from '@/lib/ssrf'
import { foreignPeopleText, mentionsPeople } from '@/lib/visuals/people'

/**
 * Ljudi samo evropskog izgleda (D-154): automatski izbor sa Pexels-a i Unsplash-a pre preuzimanja
 * pita ovu proveru koje kandidate sme da uzme. Opis koji pominje drugi izgled odbija kandidata
 * odmah, a ostale Gemini gleda na slici (fotografija, ili naslovna slika i dva kadra snimka).
 */
export interface PeopleCandidate<T> {
  item: T
  /** opis: alt fotografije, ime snimka iz adrese stranice */
  text: string
  /** adrese sličica; kadrovi snimka se spajaju u jednu sliku */
  frames: string[]
}

/** Provera bez roka pozivaoca. */
const DEFAULT_CHECK_MS = 10_000
/** Sa manje vremena od ovoga Gemini se ne pita, pa važi samo opis. */
const MIN_CHECK_MS = 2_500
const FRAME_HEIGHT = 320
const FRAME_GAP = 8

/** Sličica ili kadrovi snimka jedan pored drugog, kao jedna slika; `null` kad nijedan kadar ne stigne. */
async function frameSheet(frames: string[], timeoutMs: number): Promise<ImageInput | null> {
  const parts = (
    await Promise.all(
      frames.map(async (url) => {
        try {
          const res = await safeFetch(url, {
            timeoutMs,
            maxBytes: 3 * 1024 * 1024,
            headers: { accept: 'image/*' },
          })
          if (!res.ok) return null
          return await sharp(res.body)
            .resize({ height: FRAME_HEIGHT })
            .jpeg({ quality: 70 })
            .toBuffer({ resolveWithObject: true })
        } catch {
          return null
        }
      }),
    )
  ).filter((p) => p !== null)
  if (!parts.length) return null
  if (parts.length === 1) return { data: parts[0]!.data.toString('base64'), mimeType: 'image/jpeg' }
  let left = 0
  const composite = parts.map((p) => {
    const at = { input: p.data, left, top: 0 }
    left += p.info.width + FRAME_GAP
    return at
  })
  const sheet = await sharp({
    create: { width: left - FRAME_GAP, height: FRAME_HEIGHT, channels: 3, background: '#ffffff' },
  })
    .composite(composite)
    .jpeg({ quality: 70 })
    .toBuffer()
  return { data: sheet.toString('base64'), mimeType: 'image/jpeg' }
}

/**
 * Kandidati koje Sova sme da uzme, redom kao na ulazu. Bez ključa, posle greške modela ili kad do
 * roka (`until`, ms od epohe) nema vremena za Gemini, prolazi samo kandidat čiji opis ne pominje ljude.
 */
export async function allowedByPeople<T>(
  candidates: PeopleCandidate<T>[],
  options: { label: string; until?: number },
): Promise<T[]> {
  const clean = candidates.filter((c) => !foreignPeopleText(c.text))
  if (!clean.length) return []
  const byText = () => clean.filter((c) => !mentionsPeople(c.text)).map((c) => c.item)
  const until = options.until ?? Date.now() + DEFAULT_CHECK_MS
  if (!env.GEMINI_API_KEY || until - Date.now() < MIN_CHECK_MS) return byText()

  const sheets = await mapLimit(clean, 6, (c) =>
    frameSheet(c.frames, Math.max(1_000, Math.min(6_000, until - Date.now() - 1_000))),
  )
  // kandidat čija sličica ne stigne se ne uzima: izgled ljudi na njemu nije proveren
  const shown = clean.flatMap((c, i) => (sheets[i] ? [{ item: c.item, image: sheets[i] }] : []))
  if (!shown.length) return byText()
  if (until - Date.now() < MIN_CHECK_MS / 2) return byText()
  try {
    const outcome = await callWithFallback(
      await textModelChain(),
      (model) =>
        generateText({
          model,
          system: buildPeopleCheckSystemPrompt(),
          prompt: buildPeopleCheckPrompt(shown.length),
          images: shown.map((s) => s.image),
          jsonSchema: peopleCheckJsonSchema(),
          maxOutputTokens: 512,
          temperature: 0,
          thinking: 'minimal',
          timeoutMs: Math.max(1_000, until - Date.now()),
        }),
      { label: 'people-check', attempts: 1 },
    )
    const parsed = peopleCheckSchema.safeParse(outcome.result.json)
    if (!parsed.success) throw new Error('Provera ljudi nije po šemi.')
    const allowed = new Set(parsed.data.items.filter((r) => verdictAllowed(r.verdict)).map((r) => r.index))
    // indeks koji model nije vratio se ne uzima
    const taken = shown.filter((_, i) => allowed.has(i)).map((s) => s.item)
    logger.info('people_check', {
      label: options.label,
      checked: shown.length,
      rejected: candidates.length - taken.length,
    })
    return taken
  } catch (error) {
    logger.warn('people_check_failed', { label: options.label, code: classifyProviderError(error).code })
    return byText()
  }
}
