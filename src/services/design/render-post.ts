import 'server-only'

import { GALLERY_SOURCES, galleryWords, rankGalleryPhotos } from '@/lib/gallery/pick'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getStyle, wantsPhoto, type StyleId } from '@/lib/visuals/design'
import { photoOrder, slideRanges } from '@/lib/visuals/design/batches'
import type { PhotoSource } from '@/lib/visuals/design/catalog'
import { preparePhoto, renderSlide } from '@/lib/visuals/design/render'
import type { DesignColors, DesignFormat, Slide } from '@/lib/visuals/design/types'
import type { StepRunner } from '@/services/autopilot/runner'
import { downloadAsset, type MediaAssetRow } from '@/services/media'
import { pickPexelsPhotos } from '@/services/visuals/pexels'
import { storeServerImage } from '@/services/visuals/store'
import { pickUnsplashPhotos } from '@/services/visuals/unsplash'

import { logoDataUri, type ResolvedDesign } from './brand-design'

/**
 * Slajdovi dizajnirane objave u biblioteci (D-108): fotografije po izvoru (Unsplash pa Pexels, ili
 * galerija brenda, nikad AI), obrada za stil, render svakog slajda i čuvanje kao `template` medij.
 * Fotografija koja ne stigne ne obara objavu: slajd pada na preliv u bojama brenda, uz napomenu.
 */
export interface RenderedDesign {
  assetIds: string[]
  /** fotografije korišćene u slajdovima (atribucija za Unsplash i Pexels je u njihovim redovima) */
  photoIds: string[]
  notes: string[]
  width: number
  height: number
}

/** Fotografije iz galerije brenda: prvo one čiji opis ili oznake liče na pojam, pa najnovije. */
/**
 * Fotografije iz galerije brenda (D-114): samo kategorija toka kad je zadata (a sve kad je ona
 * prazna), redosled po poklapanju opisa, kategorije i tagova sa temom, pa po najdužem nekorišćenju.
 * Izabrane dobijaju `last_used_at`, da sledeća objava uzme druge.
 */
export async function pickGalleryPhotos(
  brandId: string,
  query: string,
  count: number,
  opts: { categoryId?: string | null; topic?: string | null } = {},
): Promise<MediaAssetRow[]> {
  if (count <= 0) return []
  const admin = createSupabaseAdminClient()
  const [{ data }, { data: categories }] = await Promise.all([
    admin
      .from('media_assets')
      .select('*')
      .eq('brand_id', brandId)
      .eq('kind', 'image')
      .in('source', [...GALLERY_SOURCES])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(300),
    admin.from('gallery_categories').select('id, name').eq('brand_id', brandId),
  ])
  const names = new Map((categories ?? []).map((c) => [c.id, c.name]))
  const all = data ?? []
  const inCategory = opts.categoryId ? all.filter((a) => a.category_id === opts.categoryId) : []
  const pool = inCategory.length ? inCategory : all
  const words = galleryWords(query, opts.topic)
  const ranked = rankGalleryPhotos(
    pool.map((a) => ({
      row: a,
      id: a.id,
      description: a.description,
      altText: a.alt_text,
      tags: a.tags,
      categoryName: a.category_id ? (names.get(a.category_id) ?? null) : null,
      lastUsedAt: a.last_used_at,
      createdAt: a.created_at,
    })),
    words,
  )
  const picked = ranked.slice(0, count).map((x) => x.row)
  if (picked.length)
    await admin
      .from('media_assets')
      .update({ last_used_at: new Date().toISOString() })
      .in(
        'id',
        picked.map((a) => a.id),
      )
  return picked
}

async function pickPhotos(input: {
  source: PhotoSource
  workspaceId: string
  brandId: string
  query: string
  count: number
  crop: 'square' | 'portrait'
  uploadedBy: string | null
  galleryCategoryId?: string | null
  topic?: string | null
}): Promise<MediaAssetRow[]> {
  if (input.source === 'none' || input.count <= 0) return []
  if (input.source === 'gallery')
    return pickGalleryPhotos(input.brandId, input.query, input.count, {
      categoryId: input.galleryCategoryId,
      topic: input.topic,
    })
  const ctx = {
    workspaceId: input.workspaceId,
    brandId: input.brandId,
    query: input.query,
    crop: input.crop,
    uploadedBy: input.uploadedBy,
  }
  // Unsplash koji ne odgovori (limit, mreža) ne ostavlja objavu bez slike: ostatak daje Pexels
  let fromUnsplash: MediaAssetRow[] = []
  try {
    fromUnsplash = (await pickUnsplashPhotos({ ...ctx, count: input.count })).map((p) => p.asset)
  } catch (error) {
    logger.warn('design_unsplash_failed', { brandId: input.brandId, error })
  }
  if (fromUnsplash.length >= input.count) return fromUnsplash
  try {
    const rest = await pickPexelsPhotos({ ...ctx, count: input.count - fromUnsplash.length })
    return [...fromUnsplash, ...rest.map((p) => p.asset)]
  } catch (error) {
    logger.warn('design_pexels_failed', { brandId: input.brandId, error })
    return fromUnsplash
  }
}

/** Fotografije po ID-ju; samo slike ovog brenda (ili bez brenda) koje nisu obrisane. */
async function loadPhotoMap(brandId: string, ids: string[]): Promise<Map<string, MediaAssetRow>> {
  if (!ids.length) return new Map()
  const { data } = await createSupabaseAdminClient()
    .from('media_assets')
    .select('*')
    .in('id', ids)
    .eq('kind', 'image')
    .is('deleted_at', null)
  return new Map((data ?? []).filter((a) => !a.brand_id || a.brand_id === brandId).map((a) => [a.id, a]))
}

/** Fotografije po ID-ju, redom kojim su date. */
async function loadPhotos(brandId: string, ids: string[]): Promise<MediaAssetRow[]> {
  const byId = await loadPhotoMap(brandId, ids)
  return ids.map((id) => byId.get(id)).filter((a): a is MediaAssetRow => Boolean(a))
}

export interface DesignRenderInput {
  workspaceId: string
  brandId: string
  design: ResolvedDesign
  styleId: StyleId
  format: DesignFormat
  slides: Slide[]
  photoSource: PhotoSource
  query: string
  uploadedBy: string | null
  colors?: DesignColors
  /** galerija (D-114): kategorija toka i tema za izbor fotografije */
  galleryCategoryId?: string | null
  topic?: string | null
  /** tačno ove fotografije iz biblioteke, redom (priložene u Studiju ili iz prethodnih slajdova) */
  photoAssetIds?: string[]
  /** date fotografije idu ukrug kad ih je korisnik sam izabrao; inače slajd bez svoje ostaje u bojama */
  cyclePhotos?: boolean
  /** oznaka u source_data (npr. ID toka ili objave) */
  origin?: Record<string, string | null>
}

export interface PickedDesignPhotos {
  photoIds: string[]
  notes: string[]
}

/**
 * Fotografije za slajdove: date iz biblioteke ili izabrane po izvoru. Svaki slajd sa fotografijom
 * dobija drugu (D-121); naslovni stil traži samo jednu. Greška izvora ne obara objavu.
 */
export async function pickDesignPhotos(input: DesignRenderInput): Promise<PickedDesignPhotos> {
  const style = getStyle(input.styleId)
  const needed = input.slides.filter((s, i) => wantsPhoto(style, s.kind, i)).length
  const count = needed === 0 ? 0 : style.photo === 'cover' ? 1 : Math.min(needed, 10)
  const notes: string[] = []
  let photos: MediaAssetRow[] = []
  try {
    photos =
      count > 0 && input.photoAssetIds?.length
        ? await loadPhotos(input.brandId, input.photoAssetIds)
        : await pickPhotos({
            source: input.photoSource,
            workspaceId: input.workspaceId,
            brandId: input.brandId,
            query: input.query,
            count,
            crop: input.format === 'story' ? 'portrait' : 'square',
            uploadedBy: input.uploadedBy,
            galleryCategoryId: input.galleryCategoryId,
            topic: input.topic,
          })
  } catch (error) {
    logger.warn('design_photos_failed', { brandId: input.brandId, error })
  }
  if (count > 0 && input.photoSource !== 'none' && photos.length === 0)
    notes.push(
      input.photoSource === 'gallery'
        ? 'U galeriji nema fotografija, pa su slajdovi bez njih. Dodajte fotografije u galeriju.'
        : 'Fotografija za temu nije nađena, pa su slajdovi u bojama brenda.',
    )
  return { photoIds: photos.map((p) => p.id), notes }
}

/**
 * Slajdovi [from, to) sa već izabranim fotografijama: obrada fotografije za stil, render i čuvanje
 * kao `template` medij. Raspored fotografija je isti za svaki deo (`photoOrder`), a čuvanje slajda
 * ide uporedo sa crtanjem sledećeg. Fotografija koja ne može da se obradi ostavlja slajd u bojama.
 */
export async function renderDesignRange(
  input: DesignRenderInput,
  photoIds: string[],
  from: number,
  to: number,
): Promise<{ assetIds: string[]; width: number; height: number }> {
  const style = getStyle(input.styleId)
  const colors = input.colors ?? input.design.colors
  const needs = input.slides.map((s, i) => wantsPhoto(style, s.kind, i))
  const order = photoOrder(needs, photoIds.length, Boolean(input.cyclePhotos))
  const wanted = [...new Set(order.slice(from, to).filter((k): k is number => k !== null))]
  const rows = await loadPhotoMap(
    input.brandId,
    wanted.map((k) => photoIds[k]!),
  )
  const prepared = new Map<number, string>()
  await Promise.all(
    wanted.map(async (k) => {
      const row = rows.get(photoIds[k]!)
      if (!row) return
      try {
        prepared.set(k, await preparePhoto(await downloadAsset(row), style, colors))
      } catch (error) {
        logger.warn('design_photo_prepare_failed', { assetId: row.id, error })
      }
    }),
  )
  const logo = await logoDataUri(input.design.logoAssetId)

  const stores: Array<Promise<string>> = []
  let size = { width: 0, height: 0 }
  try {
    for (let i = from; i < to; i++) {
      const slide = input.slides[i]!
      const k = order[i] ?? null
      const photo = k === null ? null : (prepared.get(k) ?? null)
      const rendered = await renderSlide({
        styleId: input.styleId,
        slide,
        format: input.format,
        colors,
        brandFonts: input.design.fonts,
        lockFonts: input.design.fontsLocked,
        brandName: input.design.brandName,
        handle: input.design.handle,
        logo,
        photo,
        index: i,
        total: input.slides.length,
      })
      size = { width: rendered.width, height: rendered.height }
      const stored = storeServerImage({
        workspaceId: input.workspaceId,
        brandId: input.brandId,
        bytes: rendered.bytes,
        mimeType: rendered.mimeType,
        source: 'template',
        folder: 'design',
        altText: [slide.title, slide.body].filter(Boolean).join('. ').slice(0, 500),
        tags: ['design', input.styleId],
        sourceData: {
          design: true,
          styleId: input.styleId,
          format: input.format,
          kind: slide.kind,
          index: i,
          total: input.slides.length,
          photoAssetId: photo && k !== null ? photoIds[k]! : null,
          ...(input.origin ?? {}),
        },
        uploadedBy: input.uploadedBy,
      }).then((asset) => asset.id)
      // greška čuvanja stiže kroz Promise.all ispod; ovde samo da ne ostane neobrađena dok se crta dalje
      stored.catch(() => undefined)
      stores.push(stored)
    }
  } catch (error) {
    await Promise.allSettled(stores)
    throw error
  }
  return { assetIds: await Promise.all(stores), ...size }
}

/** Ceo dizajn u jednom pozivu: zahtev koji čeka korisnik (Studio, „Generiši ponovo”, izmena). */
export async function renderDesignSlides(input: DesignRenderInput): Promise<RenderedDesign> {
  const picked = await pickDesignPhotos(input)
  const out = await renderDesignRange(input, picked.photoIds, 0, input.slides.length)
  return {
    assetIds: out.assetIds,
    photoIds: picked.photoIds,
    notes: picked.notes,
    width: out.width,
    height: out.height,
  }
}

/**
 * Isto u koracima pozadinskog posla (D-122): fotografije u jednom koraku, pa najviše tri slajda po
 * koraku. Netlify prekida svaki zahtev posle 30 sekundi, a karusel sa fotografijom na svakom
 * slajdu u jednom komadu traje duže; ponovljen korak ne bira fotografije ponovo.
 */
export async function renderDesignInSteps(
  step: StepRunner,
  input: DesignRenderInput,
): Promise<RenderedDesign> {
  const picked = await step('photos', () => pickDesignPhotos(input))
  const assetIds: string[] = []
  let size = { width: 0, height: 0 }
  for (const [from, to] of slideRanges(input.slides.length)) {
    const part = await step(`slides-${from}`, () => renderDesignRange(input, picked.photoIds, from, to))
    assetIds.push(...part.assetIds)
    size = { width: part.width, height: part.height }
  }
  return { assetIds, photoIds: picked.photoIds, notes: picked.notes, ...size }
}
