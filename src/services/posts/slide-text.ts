import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { logger } from '@/lib/logger'
import { checkAction } from '@/lib/posts/state-machine'
import type { SlideTextPreviewInput, SlideTextSaveInput } from '@/lib/schemas/slide-text'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { getStyle, styleForPhotos, wantsPhoto, type StyleId } from '@/lib/visuals/design'
import { photoOrder } from '@/lib/visuals/design/batches'
import { drawnFields, formFields, type SlideField } from '@/lib/visuals/design/fields'
import { preparePhoto, renderSlide } from '@/lib/visuals/design/render'
import { changedChunks, changedSlides, withSlideText, type SlideText } from '@/lib/visuals/design/slide-text'
import { DESIGN_SIZES, type DesignColors, type Slide, type StyleDef } from '@/lib/visuals/design/types'
import { clipPlan, sceneSeconds, videoStyleFor } from '@/lib/visuals/design/video'
import { getBrand } from '@/services/brands'
import { brandLogo, resolveDesign, type ResolvedDesign } from '@/services/design/brand-design'
import { parsePostDesign, themeOf, type PostDesignContext } from '@/services/design/post-design'
import { renderDesignRange, renderDesignSlides, type DesignRenderInput } from '@/services/design/render-post'
import {
  buildThemeVideoInSteps,
  posterPhoto,
  renderVideoOverlays,
  renderVideoPoster,
  sceneRender,
  type ThemeVideoInput,
} from '@/services/design/video-post'
import { downloadAsset } from '@/services/media'
import { loadPost, snapshotVersion, type PostRow } from '@/services/posts/posts'
import type { Json } from '@/types/database'

/**
 * Tekst na slikama (D-129): korisnik sam menja reči na slajdovima objave, karusela i priče i na
 * kadrovima videa u temi, bez tokena. Crtaju se ponovo samo izmenjeni slajdovi, u temi u kojoj je
 * objava nacrtana i sa istim fotografijama; video dobija nove slojeve teksta, a MP4 pravi pregledač
 * u Odobravanju. Objava koja ne pamti temu (starija od D-125) crta se cela u temi brenda.
 */
type TextDesign = PostDesignContext & { copy: NonNullable<PostDesignContext['copy']> }

interface TextWork {
  post: PostRow
  design: TextDesign
  /** tema brenda sada: logo, nalog i ime, a stil, boje i font za objavu koja ne pamti svoju temu */
  brandTheme: ResolvedDesign
  /** tema u kojoj je objava nacrtana (stil, boje i font iz objave); `null` kad je objava ne pamti */
  theme: ResolvedDesign | null
}

export interface SlideTextView {
  postId: string
  version: number
  format: PostDesignContext['format']
  /** veličina slike, da pregled ima pravu razmeru dok se učitava */
  width: number
  height: number
  slides: Array<{
    kind: Slide['kind']
    kicker: string | null
    title: string
    body: string | null
    stat: string | null
    items: string[] | null
    /** delovi pored naslova koje obrazac pokazuje: samo ono što stil na tom slajdu crta */
    fields: SlideField[]
  }>
}

export interface SlideTextSaved {
  version: number
  /** koliko slajdova je nacrtano ponovo (0: tekst je isti, objava se ne menja) */
  changed: number
  /** izmenjeni slajdovi koji nisu stigli u ovaj zahtev; pregledač ih šalje ponovo */
  rest: number
}

const STALE = 'Objavu je u međuvremenu neko izmenio. Osvežite je pa unesite izmene ponovo.'
const PREVIEW_WIDTH = 540

async function loadWork(viewer: Viewer, postId: string): Promise<TextWork> {
  const post = await loadPost(viewer, postId)
  const { role } = await requireMembership(viewer, post.workspace_id, EDIT_ROLES)
  const check = checkAction('edit', post.status, role)
  if (!check.ok)
    throw check.reason === 'role'
      ? new ApiError('FORBIDDEN', check.message)
      : new ApiError(
          'CONFLICT',
          'Tekst na slikama se ne menja na zakazanoj ili objavljenoj objavi. Prvo je vratite u nacrt.',
        )
  if (post.locked_at) throw new ApiError('POST_LOCKED')
  const design = parsePostDesign(post.design)
  if (!design?.copy?.slides.length || (design.format === 'video' && !design.video))
    throw new ApiError(
      'VALIDATION',
      'Ovu sliku nije nacrtala Sova, pa se tekst na njoj ne menja ovde. Opis objave možete da menjate.',
    )
  const brandTheme = await resolveDesign(await getBrand(viewer, post.brand_id))
  const theme =
    design.colors && design.fonts
      ? { ...brandTheme, styleId: design.styleId, colors: design.colors, fonts: design.fonts }
      : null
  return { post, design: design as TextDesign, brandTheme, theme }
}

/** Stil slajdova: stil objave, a za objavu bez zapamćene teme stil brenda (kao „Uskladi sa temom”). */
function slideStyle(work: TextWork): StyleId {
  return work.theme
    ? work.design.styleId
    : styleForPhotos(work.brandTheme.styleId, Boolean(work.design.ownPhotos))
}

function textFor(slide: Slide, text: SlideText, video: boolean): Slide {
  const next = withSlideText(slide, text)
  // kadar videa nema nabrajanje ni istaknut broj (`videoScenes`)
  return video ? { ...next, stat: null, items: null } : next
}

function slideInput(work: TextWork, slides: Slide[], uploadedBy: string): DesignRenderInput {
  const theme = work.theme ?? work.brandTheme
  const photos = work.design.copy.photoAssetIds
  return {
    workspaceId: work.post.workspace_id,
    brandId: work.post.brand_id,
    design: theme,
    styleId: slideStyle(work),
    format: work.design.format === 'story' ? 'story' : work.design.size,
    slides,
    // iste fotografije kao do sada; objava bez njih ne dobija nove, jer se menja samo tekst
    photoSource: photos.length ? theme.photoSource : 'none',
    query: work.design.topic.slice(0, 100),
    uploadedBy,
    photoAssetIds: photos.length ? photos : undefined,
    cyclePhotos: Boolean(work.design.ownPhotos),
    origin: { postId: work.post.id, edit: 'text' },
    variant: work.design.variant,
  }
}

function videoInput(work: TextWork, scenes: Slide[], uploadedBy: string): ThemeVideoInput {
  return {
    workspaceId: work.post.workspace_id,
    brandId: work.post.brand_id,
    design: work.theme ?? work.brandTheme,
    scenes,
    query: work.design.topic.slice(0, 100),
    uploadedBy,
    clipAssetIds: work.design.video!.clipAssetIds,
    photoAssetIds: work.design.copy.photoAssetIds,
    origin: { postId: work.post.id, edit: 'text' },
  }
}

export async function getSlideText(viewer: Viewer, postId: string): Promise<SlideTextView> {
  const work = await loadWork(viewer, postId)
  const { format, size } = work.design
  const slides = work.design.copy.slides as Slide[]
  const photos = work.design.copy.photoAssetIds
  const video = format === 'video'
  // kadar videa se crta kao jedan uspravan slajd preko snimka; slajd objave sa svojom fotografijom
  const styleId = video ? videoStyleFor((work.theme ?? work.brandTheme).styleId) : slideStyle(work)
  const order = photoOrder(
    slides.map((s, i) => wantsPhoto(getStyle(styleId), s.kind, i)),
    photos.length,
    Boolean(work.design.ownPhotos),
  )
  const drawn = (s: Slide, i: number) =>
    drawnFields(
      video
        ? { styleId, slide: s, format: 'story', index: 0, total: 1, photo: true }
        : {
            styleId,
            slide: s,
            format: format === 'story' ? 'story' : size,
            index: i,
            total: slides.length,
            photo: order[i] !== null,
          },
    ).filter((f) => !video || f === 'kicker' || f === 'body')
  return {
    postId,
    version: work.post.version,
    format,
    ...DESIGN_SIZES[format === 'story' || video ? 'story' : size],
    slides: slides.map((s, i) => ({
      kind: s.kind,
      kicker: s.kicker ?? null,
      title: s.title,
      body: s.body ?? null,
      stat: s.stat ?? null,
      items: s.items ?? null,
      fields: formFields(s, i, drawn(s, i)),
    })),
  }
}

// pregled ---------------------------------------------------------------------------------------

/** Fotografije pripremljene za stil: korisnik kuca, a fotografija slajda ostaje ista (keš u memoriji). */
const photoCache = new Map<string, Promise<string | null>>()
const PHOTO_CACHE_MAX = 24

function cachedPhoto(key: string, load: () => Promise<string | null>): Promise<string | null> {
  const hit = photoCache.get(key)
  if (hit) return hit
  const value = load().catch((error: unknown) => {
    photoCache.delete(key)
    logger.warn('slide_text_photo_failed', { error })
    return null
  })
  if (photoCache.size >= PHOTO_CACHE_MAX) photoCache.delete(photoCache.keys().next().value!)
  photoCache.set(key, value)
  return value
}

function slidePhoto(brandId: string, assetId: string, style: StyleDef, colors: DesignColors) {
  return cachedPhoto(`${brandId}:${assetId}:${style.id}:${JSON.stringify(colors)}`, async () => {
    const { data } = await createSupabaseAdminClient()
      .from('media_assets')
      .select('bucket, storage_path, brand_id')
      .eq('id', assetId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!data || (data.brand_id && data.brand_id !== brandId)) return null
    return preparePhoto(await downloadAsset(data), style, colors)
  })
}

/** Ispod kadra videa ide kadar iz njegovog snimka, a bez snimka fotografija videa. */
function scenePhoto(work: TextWork, index: number, style: StyleDef, colors: DesignColors) {
  const video = work.design.video!
  const clip = clipPlan(video.seconds, video.clipAssetIds.length)[index]?.clip ?? null
  const clipId = clip === null ? null : (video.clipAssetIds[clip] ?? null)
  const photos = work.design.copy.photoAssetIds
  const photoId = clipId || !photos.length ? null : photos[index % photos.length]!
  return cachedPhoto(
    `${work.post.brand_id}:${clipId}:${photoId}:${style.id}:${JSON.stringify(colors)}`,
    async () => {
      const bytes = await posterPhoto(clipId, photoId)
      return bytes ? preparePhoto(bytes, style, colors) : null
    },
  )
}

/** Jedan slajd ili kadar sa tekstom koji se kuca, manji od prave slike (JPEG). */
export async function previewSlideText(
  viewer: Viewer,
  postId: string,
  input: SlideTextPreviewInput,
): Promise<{ bytes: Buffer; mimeType: 'image/jpeg' | 'image/png' }> {
  const work = await loadWork(viewer, postId)
  const slides = work.design.copy.slides as Slide[]
  const base = slides[input.index]
  if (!base) throw new ApiError('VALIDATION', 'Taj slajd ne postoji.')
  const video = work.design.format === 'video'
  const slide = textFor(base, input.slide, video)
  const theme = work.theme ?? work.brandTheme
  const logo = await brandLogo(theme.logoAssetId)
  if (video) {
    const styleId = videoStyleFor(theme.styleId)
    const photo = await scenePhoto(work, input.index, getStyle(styleId), theme.colors)
    const out = await renderSlide({
      ...sceneRender(videoInput(work, slides, viewer.user.id), styleId, slide, logo),
      photo,
      outputWidth: PREVIEW_WIDTH,
      format_out: 'jpeg',
    })
    return { bytes: out.bytes, mimeType: out.mimeType }
  }
  const styleId = slideStyle(work)
  const style = getStyle(styleId)
  const photos = work.design.copy.photoAssetIds
  const order = photoOrder(
    slides.map((s, i) => wantsPhoto(style, s.kind, i)),
    photos.length,
    Boolean(work.design.ownPhotos),
  )
  const k = order[input.index] ?? null
  const photo = k === null ? null : await slidePhoto(work.post.brand_id, photos[k]!, style, theme.colors)
  const out = await renderSlide({
    styleId,
    slide,
    format: work.design.format === 'story' ? 'story' : work.design.size,
    colors: theme.colors,
    brandFonts: theme.fonts,
    lockFonts: theme.fontsLocked,
    brandName: theme.brandName,
    handle: theme.handle,
    logo,
    photo,
    index: input.index,
    total: slides.length,
    variant: work.design.variant,
    outputWidth: PREVIEW_WIDTH,
    format_out: 'jpeg',
  })
  return { bytes: out.bytes, mimeType: out.mimeType }
}

// čuvanje ---------------------------------------------------------------------------------------

/**
 * Zahtev crta koliko stigne za 15 sekundi, a ostatak pregledač šalje u sledećem (kao D-126): na
 * Netlify-u slajd sa fotografijom traje oko dve sekunde, a zahtev se prekida posle 30.
 */
let renderBudgetMs = 15_000

/** Samo za testove: kraće vreme zahteva, da se vidi slanje ostatka. */
export function setRenderBudgetForTests(ms: number): void {
  renderBudgetMs = ms
}

interface TextRender {
  design: PostDesignContext
  /** slajdovi objave redom; video nema medij dok pregledač ne napravi MP4 */
  media: string[]
  /** sve nacrtano u ovom zahtevu: briše se ako čuvanje ne uspe */
  fresh: string[]
  /** izmenjeni slajdovi nacrtani u ovom zahtevu; ostali čuvaju stari tekst do sledećeg zahteva */
  done: number[]
}

async function discard(ids: string[]): Promise<void> {
  if (!ids.length) return
  await createSupabaseAdminClient()
    .from('media_assets')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
}

/** Izmenjeni slajdovi po tri (sloj videa po jedan), dok traje vreme zahteva; prvi deo se crta uvek. */
async function withinBudget(
  changed: number[],
  draw: (from: number, to: number) => Promise<void>,
  size?: number,
): Promise<number[]> {
  const started = Date.now()
  const done: number[] = []
  for (const [from, to] of changedChunks(changed, size)) {
    if (done.length && Date.now() - started >= renderBudgetMs) break
    await draw(from, to)
    for (let i = from; i < to; i++) done.push(i)
  }
  return done
}

/** Tekst koji se čuva: nov za nacrtane slajdove, stari za one koji čekaju sledeći zahtev. */
function savedText(work: TextWork, slides: Slide[], done: number[]): Slide[] {
  const drawn = new Set(done)
  return slides.map((s, i) => (drawn.has(i) ? s : (work.design.copy.slides[i] as Slide)))
}

/** Slajdovi objave redom, ako su i dalje oni koje je Sova nacrtala; ručno menjani daju `null`. */
async function drawnSlides(work: TextWork): Promise<string[] | null> {
  const { data } = await createSupabaseAdminClient()
    .from('post_media')
    .select('media_asset_id, sort_order, media_assets(source, source_data)')
    .eq('post_id', work.post.id)
    .is('target_id', null)
    .order('sort_order')
  const rows = data ?? []
  if (rows.length !== work.design.copy.slides.length) return null
  const drawn = rows.every((r) => {
    const asset = r.media_assets as unknown as { source: string; source_data: unknown } | null
    return asset?.source === 'template' && (asset.source_data as { design?: unknown } | null)?.design === true
  })
  return drawn ? rows.map((r) => r.media_asset_id) : null
}

async function renderSlideText(
  work: TextWork,
  slides: Slide[],
  changed: number[],
  uploadedBy: string,
): Promise<TextRender> {
  const input = slideInput(work, slides, uploadedBy)
  const current = work.theme ? await drawnSlides(work) : null
  if (current) {
    const media = [...current]
    const fresh: string[] = []
    let done: number[]
    try {
      done = await withinBudget(changed, async (from, to) => {
        const part = await renderDesignRange(input, work.design.copy.photoAssetIds, from, to)
        part.assetIds.forEach((id, k) => {
          media[from + k] = id
          fresh.push(id)
        })
      })
    } catch (error) {
      await discard(fresh)
      throw error
    }
    return {
      design: { ...work.design, copy: { ...work.design.copy, slides: savedText(work, slides, done) } },
      media,
      fresh,
      done,
    }
  }
  // objava ne pamti temu ili su joj slajdovi menjani ručno: crta se cela, sa istim fotografijama
  const rendered = await renderDesignSlides(input)
  return {
    design: {
      ...work.design,
      styleId: input.styleId,
      ...(work.theme ? {} : { photoSource: work.brandTheme.photoSource, ...themeOf(work.brandTheme) }),
      copy: { slides, photoAssetIds: rendered.photoIds },
    },
    media: rendered.assetIds,
    fresh: rendered.assetIds,
    done: changed,
  }
}

async function renderVideoText(
  work: TextWork,
  scenes: Slide[],
  changed: number[],
  uploadedBy: string,
): Promise<TextRender> {
  const video = work.design.video!
  const input = videoInput(work, scenes, uploadedBy)
  if (work.theme && video.overlayAssetIds.length === scenes.length) {
    const styleId = videoStyleFor(work.theme.styleId)
    const overlays = [...video.overlayAssetIds]
    const fresh: string[] = []
    let posterAssetId = video.posterAssetId
    let done: number[]
    try {
      // sloj videa se crta dvaput (zbog providnosti), pa po jedan, da sledeći ne počne pred kraj vremena
      done = await withinBudget(
        changed,
        async (from, to) => {
          const ids = await renderVideoOverlays(input, styleId, from, to)
          ids.forEach((id, k) => {
            overlays[from + k] = id
            fresh.push(id)
          })
        },
        1,
      )
      if (done.includes(0)) {
        const poster = await renderVideoPoster(
          input,
          styleId,
          video.clipAssetIds[0] ?? null,
          work.design.copy.photoAssetIds[0] ?? null,
        )
        // slika koja ne uspe ostavlja staru; video se ionako pravi ponovo
        if (poster) {
          posterAssetId = poster
          fresh.push(poster)
        }
      }
    } catch (error) {
      await discard(fresh)
      throw error
    }
    const saved = savedText(work, scenes, done)
    return {
      design: {
        ...work.design,
        copy: { ...work.design.copy, slides: saved },
        video: {
          ...video,
          overlayAssetIds: overlays,
          seconds: saved.map(sceneSeconds),
          posterAssetId,
          renderedAssetId: null,
        },
      },
      media: [],
      fresh,
      done,
    }
  }
  const built = await buildThemeVideoInSteps((_name, fn) => fn(), input)
  return {
    design: {
      ...work.design,
      styleId: built.styleId,
      ...(work.theme ? {} : { photoSource: work.brandTheme.photoSource, ...themeOf(work.brandTheme) }),
      copy: { slides: scenes, photoAssetIds: built.photoAssetIds },
      video: {
        ...video,
        overlayAssetIds: built.overlayAssetIds,
        seconds: built.seconds,
        posterAssetId: built.posterAssetId,
        renderedAssetId: null,
      },
    },
    media: [],
    fresh: [...built.overlayAssetIds, ...(built.posterAssetId ? [built.posterAssetId] : [])],
    done: changed,
  }
}

/**
 * Čuvanje izmene: novi slajdovi umesto izmenjenih, nova verzija sa istorijom. Nacrt koji čeka
 * odluku i dalje čeka; odobrena objava se vraća u nacrt, jer je odobren stari tekst.
 */
export async function saveSlideText(
  viewer: Viewer,
  postId: string,
  input: SlideTextSaveInput,
): Promise<SlideTextSaved> {
  const work = await loadWork(viewer, postId)
  const { post } = work
  if (post.version !== input.version) throw new ApiError('CONFLICT', STALE)
  const before = work.design.copy.slides as Slide[]
  if (input.slides.length !== before.length)
    throw new ApiError('VALIDATION', 'Ovde se menja samo tekst; broj slajdova ostaje isti.')
  const video = work.design.format === 'video'
  const slides = before.map((s, i) => textFor(s, input.slides[i]!, video))
  const changed = changedSlides(before, slides)
  if (!changed.length) return { version: post.version, changed: 0, rest: 0 }

  const result = video
    ? await renderVideoText(work, slides, changed, viewer.user.id)
    : await renderSlideText(work, slides, changed, viewer.user.id)
  // naslov objave prati prvi slajd samo dok je bio isti kao on
  const title =
    result.done.includes(0) && post.title === before[0]!.title ? slides[0]!.title.slice(0, 200) : undefined
  const version = post.version + 1
  const admin = createSupabaseAdminClient()
  const { data: updated, error } = await admin
    .from('posts')
    .update({
      design: result.design as unknown as Json,
      version,
      ...(title ? { title } : {}),
      ...(post.status === 'approved' ? { status: 'draft' as const } : {}),
    })
    .eq('id', postId)
    .eq('version', post.version)
    .select('id')
  if (error || !updated?.length) {
    await discard(result.fresh)
    throw error ? mapDbError(error) : new ApiError('CONFLICT', STALE)
  }
  const { error: removeError } = await admin
    .from('post_media')
    .delete()
    .eq('post_id', postId)
    .is('target_id', null)
  if (removeError) throw mapDbError(removeError)
  if (result.media.length) {
    const { error: mediaError } = await admin
      .from('post_media')
      .insert(
        result.media.map((media_asset_id, sort_order) => ({ post_id: postId, media_asset_id, sort_order })),
      )
    if (mediaError) throw mapDbError(mediaError)
  }
  await snapshotVersion(postId, version, 'Izmenjen tekst na slikama', viewer.user.id)
  return { version, changed: result.done.length, rest: changed.length - result.done.length }
}
