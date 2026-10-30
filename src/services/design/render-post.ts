import 'server-only'

import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getStyle, wantsPhoto, type StyleId } from '@/lib/visuals/design'
import type { PhotoSource } from '@/lib/visuals/design/catalog'
import { preparePhoto, renderSlide } from '@/lib/visuals/design/render'
import type { DesignColors, DesignFormat, Slide } from '@/lib/visuals/design/types'
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
  photos: MediaAssetRow[]
  notes: string[]
  width: number
  height: number
}

/** Fotografije iz galerije brenda: prvo one čiji opis ili oznake liče na pojam, pa najnovije. */
export async function pickGalleryPhotos(
  brandId: string,
  query: string,
  count: number,
): Promise<MediaAssetRow[]> {
  if (count <= 0) return []
  const { data } = await createSupabaseAdminClient()
    .from('media_assets')
    .select('*')
    .eq('brand_id', brandId)
    .eq('kind', 'image')
    .in('source', ['upload', 'canva'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200)
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2)
  const score = (a: MediaAssetRow) => {
    const hay = `${a.alt_text ?? ''} ${a.tags.join(' ')}`.toLowerCase()
    return words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0)
  }
  return (data ?? [])
    .map((a, i) => ({ a, s: score(a), i }))
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .slice(0, count)
    .map((x) => x.a)
}

async function pickPhotos(input: {
  source: PhotoSource
  workspaceId: string
  brandId: string
  query: string
  count: number
  crop: 'square' | 'portrait'
  uploadedBy: string | null
}): Promise<MediaAssetRow[]> {
  if (input.source === 'none' || input.count <= 0) return []
  if (input.source === 'gallery') return pickGalleryPhotos(input.brandId, input.query, input.count)
  const ctx = {
    workspaceId: input.workspaceId,
    brandId: input.brandId,
    query: input.query,
    crop: input.crop,
    uploadedBy: input.uploadedBy,
  }
  const fromUnsplash = (await pickUnsplashPhotos({ ...ctx, count: input.count })).map((p) => p.asset)
  if (fromUnsplash.length >= input.count) return fromUnsplash
  const rest = await pickPexelsPhotos({ ...ctx, count: input.count - fromUnsplash.length })
  return [...fromUnsplash, ...rest.map((p) => p.asset)]
}

export async function renderDesignSlides(input: {
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
  /** oznaka u source_data (npr. ID toka ili objave) */
  origin?: Record<string, string | null>
}): Promise<RenderedDesign> {
  const style = getStyle(input.styleId)
  const colors = input.colors ?? input.design.colors
  const needs = input.slides.map((s, i) => wantsPhoto(style, s.kind, i))
  const needed = needs.filter(Boolean).length
  const count = needed === 0 ? 0 : style.photo === 'all' ? Math.min(needed, 4) : 1
  const notes: string[] = []
  let photos: MediaAssetRow[] = []
  try {
    photos = await pickPhotos({
      source: input.photoSource,
      workspaceId: input.workspaceId,
      brandId: input.brandId,
      query: input.query,
      count,
      crop: input.format === 'story' ? 'portrait' : 'square',
      uploadedBy: input.uploadedBy,
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
  const prepared = await Promise.all(
    photos.map(async (p) => {
      try {
        return await preparePhoto(await downloadAsset(p), style, colors)
      } catch (error) {
        logger.warn('design_photo_prepare_failed', { assetId: p.id, error })
        return null
      }
    }),
  )
  const usable = prepared.filter((p): p is string => Boolean(p))
  const logo = await logoDataUri(input.design.logoAssetId)

  const assetIds: string[] = []
  let k = 0
  let size = { width: 0, height: 0 }
  for (let i = 0; i < input.slides.length; i++) {
    const slide = input.slides[i]!
    const photo = needs[i] && usable.length ? usable[k++ % usable.length]! : null
    const rendered = await renderSlide({
      styleId: input.styleId,
      slide,
      format: input.format,
      colors,
      brandFonts: input.design.fonts,
      brandName: input.design.brandName,
      handle: input.design.handle,
      logo,
      photo,
      index: i,
      total: input.slides.length,
    })
    size = { width: rendered.width, height: rendered.height }
    const asset = await storeServerImage({
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
        photoAssetId: photo ? (photos[(k - 1) % photos.length]?.id ?? null) : null,
        ...(input.origin ?? {}),
      },
      uploadedBy: input.uploadedBy,
    })
    assetIds.push(asset.id)
  }
  return { assetIds, photos, notes, ...size }
}
