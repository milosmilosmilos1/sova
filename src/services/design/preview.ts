import 'server-only'

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import { toContentLocale, type ContentLocale } from '@/config/locales'
import type { Viewer } from '@/lib/auth/viewer'
import type { PreviewInput } from '@/lib/schemas/design'
import { getStyle, wantsPhoto, type Slide, type SlideKind } from '@/lib/visuals/design'
import { preparePhoto, renderOverlay, renderSlide } from '@/lib/visuals/design/render'
import { videoStyleFor } from '@/lib/visuals/design/video'
import { getBrand } from '@/services/brands'

import { logoDataUri, resolveDesign } from './brand-design'

/**
 * Pregled stila uživo (D-108): mala slika slajda u bojama i fontovima brenda, sa primerom teksta
 * na jeziku brenda i primerom fotografije. Keš u memoriji, jer birač traži 22 slike odjednom.
 */
const SAMPLES: Record<ContentLocale, Record<SlideKind, Slide>> = {
  'sr-Latn': {
    cover: {
      kind: 'cover',
      kicker: 'Vodič',
      title: 'Tri promene koje donose više upita',
      body: 'Kratak vodič za brendove koji žele bolje rezultate sa mreža.',
    },
    point: {
      kind: 'point',
      title: 'Jedna jasna poruka po objavi',
      body: 'Kad objava kaže jednu stvar, ljudi je zapamte. Sve ostalo izbacite.',
      stat: '3x',
    },
    cta: {
      kind: 'cta',
      title: 'Želite ovakve objave?',
      body: 'Pišite nam u poruke i dobićete plan za vaš brend.',
    },
  },
  'sr-Cyrl': {
    cover: {
      kind: 'cover',
      kicker: 'Водич',
      title: 'Три промене које доносе више упита',
      body: 'Кратак водич за брендове који желе боље резултате са мрежа.',
    },
    point: {
      kind: 'point',
      title: 'Једна јасна порука по објави',
      body: 'Кад објава каже једну ствар, људи је запамте. Све остало избаците.',
      stat: '3x',
    },
    cta: {
      kind: 'cta',
      title: 'Желите овакве објаве?',
      body: 'Пишите нам у поруке и добићете план за ваш бренд.',
    },
  },
  en: {
    cover: {
      kind: 'cover',
      kicker: 'Guide',
      title: 'Three changes that bring more enquiries',
      body: 'A short guide for brands that want better results from social media.',
    },
    point: {
      kind: 'point',
      title: 'One clear message per post',
      body: 'When a post says one thing, people remember it. Cut everything else.',
      stat: '3x',
    },
    cta: {
      kind: 'cta',
      title: 'Want posts like this?',
      body: 'Send us a message and get a plan for your brand.',
    },
  },
  uk: {
    cover: {
      kind: 'cover',
      kicker: 'Посібник',
      title: 'Три зміни, що приносять більше запитів',
      body: 'Короткий посібник для брендів, які хочуть кращих результатів у соцмережах.',
    },
    point: {
      kind: 'point',
      title: 'Одна чітка думка в кожному дописі',
      body: 'Коли допис каже одне, люди це запам’ятовують. Решту приберіть.',
      stat: '3x',
    },
    cta: {
      kind: 'cta',
      title: 'Хочете такі дописи?',
      body: 'Напишіть нам і отримайте план для вашого бренду.',
    },
  },
}

const SAMPLE_PHOTO = path.join(process.cwd(), 'src', 'lib', 'visuals', 'design', 'sample', 'photo.jpg')
let samplePhoto: Promise<Buffer> | null = null

const cache = new Map<string, Buffer>()
const CACHE_MAX = 300
const PREVIEW_WIDTH = 432

/** Fotografija ispod sloja videa u biraču teme (D-128): primer fotografije isečen na 9:16. */
let backdrop: Promise<Buffer> | null = null
function videoBackdrop(): Promise<Buffer> {
  samplePhoto ??= readFile(SAMPLE_PHOTO)
  backdrop ??= samplePhoto.then((photo) =>
    sharp(photo)
      .resize({ width: PREVIEW_WIDTH, height: Math.round((PREVIEW_WIDTH * 16) / 9), fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer(),
  )
  return backdrop
}

export interface PreviewImage {
  bytes: Buffer
  mimeType: 'image/jpeg' | 'image/png'
}

export async function renderPreview(viewer: Viewer, input: PreviewInput): Promise<PreviewImage> {
  if (input.layer === 'backdrop') {
    await getBrand(viewer, input.brandId)
    return { bytes: await videoBackdrop(), mimeType: 'image/jpeg' }
  }
  const brand = await getBrand(viewer, input.brandId)
  const design = await resolveDesign(brand)
  const colors = input.colors ?? design.colors
  // font koji korisnik upravo bira (D-123) važi kao izabran font brenda
  const fonts = input.font ? { headings: input.font, body: input.font } : design.fonts
  const lockFonts = Boolean(input.font) || design.fontsLocked
  const locale = toContentLocale(brand.content_locale)
  const base = SAMPLES[locale][input.kind]
  const slide: Slide = input.title ? { ...base, title: input.title, body: input.body ?? base.body } : base
  const style = getStyle(input.styleId)
  const index = input.kind === 'cover' ? 0 : input.kind === 'point' ? 1 : 4
  const usePhoto = input.withPhoto && wantsPhoto(style, slide.kind, index)
  const key = createHash('sha1')
    .update(
      JSON.stringify([
        input.layer,
        input.styleId,
        input.format,
        input.kind,
        colors,
        fonts,
        lockFonts,
        design.handle,
        brand.name,
        design.logoAssetId,
        locale,
        slide,
        usePhoto,
      ]),
    )
    .digest('hex')
  const mimeType = input.layer === 'overlay' ? 'image/png' : 'image/jpeg'
  const hit = cache.get(key)
  if (hit) return { bytes: hit, mimeType }
  if (input.layer === 'overlay') {
    // sloj naslovnog kadra videa u stilu teme; tipografska tema ide preko snimka kao Poster
    const overlay = await renderOverlay({
      styleId: videoStyleFor(input.styleId),
      slide: { ...SAMPLES[locale].cover, ...(input.title ? { title: input.title } : {}) },
      format: 'story',
      colors,
      brandFonts: fonts,
      lockFonts,
      brandName: brand.name,
      handle: design.handle,
      logo: await logoDataUri(design.logoAssetId),
      index: 0,
      total: 1,
      outputWidth: PREVIEW_WIDTH,
    })
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!)
    cache.set(key, overlay.bytes)
    return { bytes: overlay.bytes, mimeType }
  }
  samplePhoto ??= readFile(SAMPLE_PHOTO)
  const photo = usePhoto ? await preparePhoto(await samplePhoto, style, colors) : null
  const result = await renderSlide({
    styleId: input.styleId,
    slide,
    format: input.format,
    colors,
    brandFonts: fonts,
    lockFonts,
    brandName: brand.name,
    handle: design.handle,
    logo: await logoDataUri(design.logoAssetId),
    photo,
    index,
    total: 5,
    outputWidth: PREVIEW_WIDTH,
    format_out: 'jpeg',
  })
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!)
  cache.set(key, result.bytes)
  return { bytes: result.bytes, mimeType }
}

export function clearPreviewCacheForTests(): void {
  cache.clear()
}
