import 'server-only'

import sharp from 'sharp'
import { z } from 'zod'

import { classifyProviderError } from '@/lib/ai/errors'
import { generateText, type ImageInput } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback } from '@/lib/ai/orchestrator'
import {
  buildPhotoCheckPrompt,
  buildPhotoCheckSystemPrompt,
  photoCheckItemSchema,
  photoCheckJsonSchema,
  subjectBoxOf as toBox,
  type MatchLevel,
  type PhotoCheckItem,
} from '@/lib/ai/prompts/photo-check'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { mapLimit } from '@/lib/map-limit'
import { safeFetch } from '@/lib/ssrf'
import { boxCenter, subjectFits, type Focus, type SubjectBox } from '@/lib/visuals/focus'
import { foreignPeopleText, mentionsPeople } from '@/lib/visuals/people'
import { textMatchesQuery } from '@/lib/visuals/relevance'

/**
 * Provera kandidata pre automatskog izbora (D-167, D-169, D-180). Sa Unsplash-a i Pexels-a Sova uzima
 * samo fotografiju ili snimak čiji opis odgovara upitu i ne pominje ljude, bez slanja slike modelu.
 * Iz galerije brenda Gemini gleda da li fotografija pripada temi (i iz iste oblasti), da li lepo stoji
 * u objavi i gde je glavni predmet, da isečak ne odseče ono zbog čega je slika izabrana; izgled ljudi
 * se nigde ne procenjuje.
 */
export interface PhotoCandidate<T> {
  item: T
  /** opis: alt fotografije, ime snimka iz adrese, opis i oznake u galeriji */
  text: string
  /**
   * adrese sličica, same slike ili funkcija koja sliku preuzme tek kad je provera zaista gleda;
   * kadrovi snimka se spajaju u jednu sliku
   */
  frames: Frame[]
  /** veličina cele fotografije, za proveru da predmet staje u okvir slajda */
  size?: { width: number; height: number } | null
}

type Frame = string | Buffer | (() => Promise<Buffer>)

export interface PhotoSubject {
  /** tema objave kako ju je napisao korisnik ili plan (jezik brenda) */
  topic?: string | null
  /** upit pretrage na engleskom */
  query: string
}

export interface CheckedPhoto<T> {
  item: T
  /** sredina glavnog predmeta na slici; `null` kad slika nije gledana (rezerva po opisu) */
  focus: Focus | null
  /** okvir glavnog predmeta, od 0 do 1; `null` kad slika nije gledana */
  box?: SubjectBox | null
}

export interface PhotoCheckOptions {
  label: string
  /** rok (ms od epohe) za celu proveru */
  until?: number
  subject: PhotoSubject
  /**
   * `stock` (Unsplash, Pexels, D-180): samo po opisu, bez slanja slike modelu.
   * `gallery` (fotografije brenda): Gemini, sve osim onoga što temi ne pripada; bolje poklapanje
   * ide napred, a upotrebljiva slika pre neupotrebljive.
   */
  mode?: 'stock' | 'gallery'
  /**
   * okvir slajda za fotografiju (širina / visina, D-169): iz galerije slika u kojoj predmet koji mora
   * ostati ceo ne staje u okvir ide posle onih koje staju
   */
  frame?: { aspect: number } | null
}

/** Provera bez roka pozivaoca. */
const DEFAULT_CHECK_MS = 10_000
/** Sa manje vremena od ovoga Gemini se ne pita, pa važi rezerva po opisu. */
const MIN_CHECK_MS = 2_500
const FRAME_HEIGHT = 320
const FRAME_GAP = 8

async function framePart(frame: Frame, timeoutMs: number) {
  try {
    let bytes: Buffer
    if (typeof frame === 'string') {
      const res = await safeFetch(frame, {
        timeoutMs,
        maxBytes: 3 * 1024 * 1024,
        headers: { accept: 'image/*' },
      })
      if (!res.ok) return null
      bytes = res.body
    } else if (typeof frame === 'function') {
      let timer: ReturnType<typeof setTimeout> | undefined
      bytes = await Promise.race([
        frame(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Slika nije stigla na vreme.')), timeoutMs)
        }),
      ]).finally(() => clearTimeout(timer))
    } else bytes = frame
    // okret iz EXIF-a, kao pri crtanju: fokus važi za sliku kakvu stil prikazuje
    return await sharp(bytes, { limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ height: FRAME_HEIGHT })
      .jpeg({ quality: 70 })
      .toBuffer({ resolveWithObject: true })
  } catch {
    return null
  }
}

/** Sličica ili kadrovi snimka jedan pored drugog, kao jedna slika; `null` kad nijedan kadar ne stigne. */
async function frameSheet(frames: Frame[], timeoutMs: number): Promise<ImageInput | null> {
  const parts = (await Promise.all(frames.map((f) => framePart(f, timeoutMs)))).filter((p) => p !== null)
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

const looseOutput = z.object({ items: z.array(z.unknown()) })

const CENTER: Focus = { x: 0.5, y: 0.5 }

/** Redosled poklapanja: niži broj ide napred. */
const MATCH_RANK: Record<MatchLevel, number> = { exact: 0, subject: 1, area: 2, off: 3 }

/**
 * Kandidati koje Sova sme da uzme, sa fokusom: bolje poklapanje napred, a pri istom poklapanju
 * redom kao na ulazu (redosled pretrage).
 *
 * Stok (Unsplash, Pexels, D-180): ti servisi ne dozvoljavaju AI obradu svojih fotografija, pa se ne
 * šalju modelu. Prolazi samo fotografija čiji opis deli reč sa upitom i ne pominje ljude: izgled ljudi
 * se bez gledanja ne zna, a publika je Balkan i Evropa (D-136). Fotografiju sa ljudima korisnik bira
 * ručno. Fokus ostaje na sredini, a stil seče za okvir slajda.
 *
 * Galerija brenda: Gemini gleda temu, upotrebljivost i gde je glavni predmet, bez procene ljudi.
 * Bez ključa, posle greške modela ili kad do roka nema vremena za Gemini, galerija ostaje u
 * redosledu kakav je dobila.
 */
export async function checkPhotos<T>(
  candidates: PhotoCandidate<T>[],
  options: PhotoCheckOptions,
): Promise<CheckedPhoto<T>[]> {
  if ((options.mode ?? 'stock') === 'stock')
    return candidates
      .filter(
        (c) =>
          !foreignPeopleText(c.text) &&
          !mentionsPeople(c.text) &&
          textMatchesQuery(c.text, options.subject.query),
      )
      .map((c) => ({ item: c.item, focus: null }))
  if (!candidates.length) return []
  const inOrder = (): CheckedPhoto<T>[] => candidates.map((c) => ({ item: c.item, focus: null }))
  const until = options.until ?? Date.now() + DEFAULT_CHECK_MS
  if (!env.GEMINI_API_KEY || until - Date.now() < MIN_CHECK_MS) return inOrder()

  const sheets = await mapLimit(candidates, 6, (c) =>
    frameSheet(c.frames, Math.max(1_000, Math.min(6_000, until - Date.now() - 1_000))),
  )
  // kandidat čija slika ne stigne se ne uzima: nije proveren
  const shown = candidates.flatMap((c, i) =>
    sheets[i] ? [{ item: c.item, image: sheets[i], size: c.size }] : [],
  )
  if (!shown.length) return inOrder()
  if (until - Date.now() < MIN_CHECK_MS / 2) return inOrder()
  try {
    const outcome = await callWithFallback(
      await textModelChain(),
      (model) =>
        generateText({
          model,
          system: buildPhotoCheckSystemPrompt(),
          prompt: buildPhotoCheckPrompt({
            count: shown.length,
            topic: options.subject.topic,
            query: options.subject.query,
          }),
          images: shown.map((s) => s.image),
          jsonSchema: photoCheckJsonSchema(),
          maxOutputTokens: 200 + shown.length * 100,
          temperature: 0,
          thinking: 'minimal',
          timeoutMs: Math.max(1_000, until - Date.now()),
        }),
      { label: 'photo-check', attempts: 1 },
    )
    const parsed = looseOutput.safeParse(outcome.result.json)
    if (!parsed.success) throw new Error('Provera fotografija nije po šemi.')
    // stavka van šeme ili indeks koji model nije vratio se ne uzima
    const verdicts = new Map<number, PhotoCheckItem>()
    for (const raw of parsed.data.items) {
      const item = photoCheckItemSchema.safeParse(raw)
      if (item.success && item.data.index < shown.length && !verdicts.has(item.data.index))
        verdicts.set(item.data.index, item.data)
    }
    const reasons = { off: 0, missing: 0 }
    const taken: Array<CheckedPhoto<T> & { rank: number }> = []
    shown.forEach((s, i) => {
      const v = verdicts.get(i)
      if (!v) return void reasons.missing++
      // iz galerije i slika iz iste oblasti, ali ne ono što temi ne pripada
      if (v.match === 'off') return void reasons.off++
      const box = toBox(v)
      // predmet koji mora ostati ceo staje u okvir slajda (D-169); takva slika ide posle onih koje staju
      const fits =
        !options.frame || !s.size || !v.whole || !box || subjectFits(s.size, box, options.frame.aspect)
      taken.push({
        item: s.item,
        focus: box ? boxCenter(box) : CENTER,
        box,
        rank: MATCH_RANK[v.match] * 4 + (fits ? 0 : 2) + (v.usable ? 0 : 1),
      })
    })
    logger.info('photo_check', {
      label: options.label,
      checked: shown.length,
      taken: taken.length,
      exact: taken.filter((t) => t.rank < 4).length,
      rejected: { ...reasons, frames: candidates.length - shown.length },
    })
    // stabilno: pri istom poklapanju ostaje redosled pretrage
    return [...taken].sort((a, b) => a.rank - b.rank).map(({ item, focus, box }) => ({ item, focus, box }))
  } catch (error) {
    logger.warn('photo_check_failed', { label: options.label, code: classifyProviderError(error).code })
    return inOrder()
  }
}
