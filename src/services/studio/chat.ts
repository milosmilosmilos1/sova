import 'server-only'

import sharp from 'sharp'

import { toContentLocale } from '@/config/locales'
import type { SocialPlatform } from '@/config/platforms'
import { FORMAT_LABEL, formatsForPlatforms, type PostFormat } from '@/config/post-formats'
import messages from '@/i18n/messages/sr-Latn.json'
import { AiError, toApiError } from '@/lib/ai/errors'
import { generateText, type ImageInput } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback, costFor } from '@/lib/ai/orchestrator'
import {
  buildStudioPrompt,
  buildStudioSystemPrompt,
  normalizeStudioDecision,
  studioDecisionSchema,
  studioJsonSchema,
  type NormalizedStudioDecision,
  type StudioCurrentPost,
  type StudioHistoryItem,
  type StudioLinkFacts,
  type StudioNote,
  type StudioRevision,
} from '@/lib/ai/prompts/studio'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { parseVoice } from '@/lib/brand/voice'
import { logger } from '@/lib/logger'
import type { ComposeInput } from '@/lib/schemas/ai'
import { STUDIO_CONTEXT, STUDIO_HISTORY, STUDIO_KEEP, type StudioMessageInput } from '@/lib/schemas/studio'
import { findLink } from '@/lib/studio/link'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { getTokenPrice, getTokenPrices } from '@/lib/tokens/prices'
import { confirmReservation, releaseReservation } from '@/lib/tokens/reservation'
import { STYLE_IDS } from '@/lib/visuals/design/catalog'
import type { Slide } from '@/lib/visuals/design/types'
import { wallClock } from '@/lib/zoned-time'
import { styleForPhotos } from '@/lib/visuals/design'
import { composePost } from '@/services/ai/compose'
import { assertDailyQuota, failGeneration, startGeneration } from '@/services/ai/generations'
import { buildBrandContext } from '@/services/ai/text'
import { getBrand, type BrandRow } from '@/services/brands'
import { resolveDesign } from '@/services/design/brand-design'
import { parsePostDesign, themeOf, type PostDesignContext } from '@/services/design/post-design'
import { renderDesignSlides } from '@/services/design/render-post'
import { buildThemeVideoInSteps, videoPostDesign } from '@/services/design/video-post'
import { downloadAsset, getAsset, type MediaAssetRow } from '@/services/media'
import { getPostView, updatePost, type PostView } from '@/services/posts/posts'
import { listSocialAccounts } from '@/services/social/accounts'
import type { Database, Json } from '@/types/database'

import { fetchLinkFacts } from './link-facts'

/**
 * Studio kao razgovor (D-116). Svaka poruka je jedan poziv Gemini-ja (1 token) koji odluči šta
 * korisnik traži: odgovor, nova objava ili izmena objave otvorene desno. Nova objava ide kroz
 * „Novu objavu” (tekst 2 tokena, slajdovi i besplatne fotografije 0), a poruka koja je napravi
 * se ne naplaćuje. Izmena menja opis, prvi komentar i tekst slajdova (slajdovi se crtaju ponovo
 * sa istim fotografijama). Razgovor se čuva po korisniku i brendu; neuspela poruka se ne upisuje.
 */
type MessageRow = Database['public']['Tables']['studio_messages']['Row']
type StoredAction = 'reply' | 'create' | 'revise' | 'failed'

export interface StudioAttachment {
  kind: 'photo' | 'link'
  assetId?: string
  /** potpisan URL sličice za fotografiju, adresa za link */
  url: string | null
  title?: string | null
}

export interface StudioMessageView {
  id: string
  role: 'user' | 'assistant'
  body: string
  action: StoredAction | null
  postId: string | null
  attachments: StudioAttachment[]
  format: PostFormat | null
  /** napomene „Nove objave” (npr. fotografija nije nađena) */
  notes: string[]
  /** napomene Studija, prevode se u interfejsu */
  noteCodes: StudioNote[]
  suggestions: string[]
  tokens: number
  error: { code: string; message: string } | null
  createdAt: string
}

export interface StudioThreadView {
  messages: StudioMessageView[]
  /** poslednja objava iz razgovora koja još postoji: otvara se desno */
  lastPostId: string | null
  prices: { message: number; text: number }
  /** mreže povezanih aktivnih naloga (podrazumevane za sledeću objavu) */
  platforms: SocialPlatform[]
  timezone: string
  /** teme iz glasa brenda za brze ideje */
  topics: string[]
}

export interface StudioTurnView {
  messages: StudioMessageView[]
  /** objava za desni panel: nova ili izmenjena */
  postId: string | null
  tokensCharged: number
}

interface StoredMeta {
  format?: PostFormat | null
  notes?: string[]
  noteCodes?: StudioNote[]
  suggestions?: string[]
  tokens?: number
  error?: { code: string; message: string } | null
}

const STYLE_NAMES = messages.design.styles as Record<string, { name: string }>

function asMeta(value: Json): StoredMeta {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as StoredMeta) : {}
}

function asAttachments(value: Json): StudioAttachment[] {
  return Array.isArray(value) ? (value as unknown as StudioAttachment[]) : []
}

function toView(row: MessageRow, thumbs: Map<string, string>): StudioMessageView {
  const meta = asMeta(row.meta)
  return {
    id: row.id,
    role: row.role as StudioMessageView['role'],
    body: row.body,
    action: (row.action as StoredAction | null) ?? null,
    postId: row.post_id,
    attachments: asAttachments(row.attachments).map((a) =>
      a.kind === 'photo' ? { ...a, url: a.assetId ? (thumbs.get(a.assetId) ?? null) : null } : a,
    ),
    format: meta.format ?? null,
    notes: meta.notes ?? [],
    noteCodes: meta.noteCodes ?? [],
    suggestions: meta.suggestions ?? [],
    tokens: meta.tokens ?? 0,
    error: meta.error ?? null,
    createdAt: row.created_at,
  }
}

/** Potpisane sličice priloženih fotografija, jedan poziv po bucket-u. */
async function photoThumbs(rows: MessageRow[]): Promise<Map<string, string>> {
  const ids = new Set<string>()
  for (const r of rows)
    for (const a of asAttachments(r.attachments)) if (a.kind === 'photo' && a.assetId) ids.add(a.assetId)
  const thumbs = new Map<string, string>()
  if (!ids.size) return thumbs
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('media_assets')
    .select('id, bucket, storage_path')
    .in('id', [...ids])
    .is('deleted_at', null)
  const byBucket = new Map<string, Array<{ id: string; path: string }>>()
  for (const a of data ?? [])
    byBucket.set(a.bucket, [...(byBucket.get(a.bucket) ?? []), { id: a.id, path: a.storage_path }])
  for (const [bucket, list] of byBucket) {
    const { data: signed } = await admin.storage.from(bucket).createSignedUrls(
      list.map((l) => l.path),
      3600,
    )
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))
    for (const l of list) {
      const url = byPath.get(l.path)
      if (url) thumbs.set(l.id, url)
    }
  }
  return thumbs
}

async function activePlatforms(viewer: Viewer, brandId: string): Promise<SocialPlatform[]> {
  const { accounts } = await listSocialAccounts(viewer, brandId)
  return [...new Set(accounts.filter((a) => a.status === 'active').map((a) => a.platform as SocialPlatform))]
}

export async function getStudioThread(viewer: Viewer, brandId: string): Promise<StudioThreadView> {
  const brand = await getBrand(viewer, brandId)
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('studio_messages')
    .select('*')
    .eq('brand_id', brand.id)
    .eq('user_id', viewer.user.id)
    .order('created_at', { ascending: false })
    .limit(STUDIO_HISTORY)
  if (error) throw mapDbError(error)
  const rows = (data ?? []).reverse()
  const postIds = [...new Set(rows.filter((r) => r.post_id).map((r) => r.post_id!))]
  let lastPostId: string | null = null
  if (postIds.length) {
    const { data: posts } = await admin.from('posts').select('id').in('id', postIds).is('deleted_at', null)
    const alive = new Set((posts ?? []).map((p) => p.id))
    lastPostId = [...rows].reverse().find((r) => r.post_id && alive.has(r.post_id))?.post_id ?? null
  }
  const [thumbs, prices, platforms] = await Promise.all([
    photoThumbs(rows),
    getTokenPrices(),
    activePlatforms(viewer, brand.id),
  ])
  return {
    messages: rows.map((r) => toView(r, thumbs)),
    lastPostId,
    prices: { message: prices.studio_chat, text: prices.text },
    platforms,
    timezone: brand.timezone,
    topics: parseVoice(brand.voice)?.topics ?? [],
  }
}

export async function clearStudioThread(viewer: Viewer, brandId: string): Promise<{ deleted: number }> {
  const brand = await getBrand(viewer, brandId)
  const { count, error } = await createSupabaseAdminClient()
    .from('studio_messages')
    .delete({ count: 'exact' })
    .eq('brand_id', brand.id)
    .eq('user_id', viewer.user.id)
  if (error) throw mapDbError(error)
  return { deleted: count ?? 0 }
}

/** Vrsta objave za Sovin kontekst: iz dizajna kad postoji, inače po medijima i linku. */
function formatOf(view: PostView, design: PostDesignContext | null): PostFormat | null {
  if (design) return design.format === 'single' ? 'image' : design.format
  if (view.targets.some((t) => (t.options as { format?: unknown }).format === 'story')) return 'story'
  if (view.media.some((m) => m.mimeType?.startsWith('video'))) return 'video'
  if (view.media.length > 1) return 'carousel'
  if (view.media.length === 1) return 'image'
  return view.linkUrl ? 'link' : 'text'
}

interface CurrentPost {
  view: PostView
  design: PostDesignContext | null
  format: PostFormat | null
  editable: boolean
}

async function loadCurrent(viewer: Viewer, brandId: string, postId: string): Promise<CurrentPost | null> {
  let view: PostView
  try {
    view = await getPostView(viewer, postId)
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') return null
    throw error
  }
  if (view.brandId !== brandId) return null
  const { data } = await createSupabaseAdminClient()
    .from('posts')
    .select('design')
    .eq('id', postId)
    .maybeSingle()
  const design = parsePostDesign(data?.design)
  return {
    view,
    design,
    format: formatOf(view, design),
    editable: view.actions.includes('edit') && !view.lockedAt,
  }
}

async function loadPhotos(viewer: Viewer, brand: BrandRow, ids: string[]): Promise<MediaAssetRow[]> {
  const photos: MediaAssetRow[] = []
  for (const id of [...new Set(ids)]) {
    const asset = await getAsset(viewer, id)
    if (asset.workspace_id !== brand.workspace_id || (asset.brand_id && asset.brand_id !== brand.id))
      throw new ApiError('VALIDATION', 'Fotografija pripada drugom brendu.')
    if (asset.kind !== 'image')
      throw new ApiError('VALIDATION', 'Uz poruku možete priložiti samo fotografije.')
    photos.push(asset)
  }
  return photos
}

/** Fotografija za model: najviše 768 px po dužoj strani, JPEG, da poruka ostane jeftina. */
async function promptImage(asset: MediaAssetRow): Promise<ImageInput | null> {
  try {
    const bytes = await sharp(await downloadAsset(asset))
      .rotate()
      .resize(768, 768, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()
    return { data: bytes.toString('base64'), mimeType: 'image/jpeg' }
  } catch (error) {
    logger.warn('studio_photo_prepare_failed', { assetId: asset.id, error })
    return null
  }
}

function resultLabel(row: MessageRow): string | null {
  const meta = asMeta(row.meta)
  if (row.action === 'create' && meta.format) return `napravljena objava: ${FORMAT_LABEL[meta.format]}`
  if (row.action === 'revise') return 'izmenjena objava otvorena desno'
  if (row.action === 'failed') return `nije uspelo: ${meta.error?.message ?? 'greška'}`
  return null
}

async function recentHistory(brandId: string, userId: string): Promise<StudioHistoryItem[]> {
  const { data } = await createSupabaseAdminClient()
    .from('studio_messages')
    .select('*')
    .eq('brand_id', brandId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(STUDIO_CONTEXT)
  return (data ?? [])
    .reverse()
    .map((r) => ({ role: r.role as 'user' | 'assistant', body: r.body, result: resultLabel(r) }))
}

/** Tekst za X kad je nov opis duži od 280 znakova (ostale mreže uzimaju glavni tekst). */
function xText(caption: string): string | undefined {
  return caption.length <= 280 ? undefined : `${caption.slice(0, 277).trimEnd()}…`
}

/** Slajdovi (ili kadrovi videa) posle izmene iz Studija: menja se samo tekst navedenih. */
function revisedSlides(copy: NonNullable<PostDesignContext['copy']>, revision: StudioRevision) {
  return copy.slides.map((s, i) => {
    const change = revision.slides.find((c) => c.index === i + 1)
    return change ? { ...s, title: change.title, body: change.body } : s
  })
}

async function reviseStudioPost(
  viewer: Viewer,
  brand: BrandRow,
  current: CurrentPost,
  revision: StudioRevision,
): Promise<PostView> {
  const { view, design } = current
  let media: Array<{ mediaAssetId: string; sortOrder: number }> | undefined
  let title: string | undefined
  let nextDesign: PostDesignContext | null = null
  if (revision.slides.length && design?.copy && design.format === 'video' && design.video) {
    // video u temi (D-128): novi slojevi teksta preko istih snimaka; MP4 pregledač pravi ponovo
    const slides = revisedSlides(design.copy, revision) as Slide[]
    const theme = await resolveDesign(brand)
    const video = await buildThemeVideoInSteps((_name, fn) => fn(), {
      workspaceId: brand.workspace_id,
      brandId: brand.id,
      design: theme,
      scenes: slides,
      query: design.topic.slice(0, 100),
      uploadedBy: viewer.user.id,
      clipAssetIds: design.video.clipAssetIds,
      photoAssetIds: design.copy.photoAssetIds,
      origin: { postId: view.id },
    })
    media = []
    title = slides[0]?.title.slice(0, 200)
    nextDesign = videoPostDesign(
      {
        topic: design.topic,
        cta: design.cta,
        locale: design.locale,
        platforms: design.platforms,
        flowId: design.flowId,
        dmCta: design.dmCta,
      },
      theme,
      slides,
      video,
    )
  } else if (revision.slides.length && design?.copy) {
    const slides = revisedSlides(design.copy, revision)
    // izmena crta objavu u trenutnoj temi brenda (D-125); priložena fotografija ostaje vidljiva
    const theme = await resolveDesign(brand)
    const styleId = styleForPhotos(theme.styleId, Boolean(design.ownPhotos))
    const rendered = await renderDesignSlides({
      workspaceId: brand.workspace_id,
      brandId: brand.id,
      design: theme,
      styleId,
      format: design.format === 'story' ? 'story' : design.size,
      slides: slides as Slide[],
      photoSource: theme.photoSource,
      query: design.topic.slice(0, 100),
      uploadedBy: viewer.user.id,
      // iste fotografije kao do sada; menja se samo tekst
      photoAssetIds: design.copy.photoAssetIds.length ? design.copy.photoAssetIds : undefined,
      cyclePhotos: Boolean(design.ownPhotos),
      origin: { postId: view.id },
    })
    media = rendered.assetIds.map((mediaAssetId, sortOrder) => ({ mediaAssetId, sortOrder }))
    title = slides[0]?.title.slice(0, 200)
    nextDesign = {
      ...design,
      styleId,
      photoSource: theme.photoSource,
      ...themeOf(theme),
      copy: { slides, photoAssetIds: rendered.photoIds },
    }
  }
  const caption = revision.caption
  const updated = await updatePost(viewer, view.id, {
    version: view.version,
    ...(title ? { title } : {}),
    ...(caption
      ? {
          masterText: caption,
          targets: view.targets.map((t) => ({
            socialAccountId: t.socialAccountId,
            text: t.platform === 'x' ? xText(caption) : undefined,
            options: t.options,
          })),
        }
      : {}),
    ...(revision.firstComment !== undefined ? { firstComment: revision.firstComment } : {}),
    ...(media ? { media } : {}),
    changeSummary: 'Izmena iz Studija',
  })
  if (nextDesign)
    await createSupabaseAdminClient()
      .from('posts')
      .update({ design: nextDesign as unknown as Json })
      .eq('id', view.id)
  return updated
}

function errorOf(error: unknown): { code: string; message: string } {
  const api = error instanceof ApiError ? error : toApiError(error)
  return { code: api.code, message: api.message }
}

export async function sendStudioMessage(
  viewer: Viewer,
  input: StudioMessageInput,
  meta: { requestId: string; idempotencyKey?: string | null },
): Promise<StudioTurnView> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  await assertDailyQuota(brand.workspace_id)
  const startedAt = new Date().toISOString()

  const photos = await loadPhotos(viewer, brand, input.photoIds)
  const link = findLink(input.text)
  const [linkFacts, current, connected, history] = await Promise.all([
    link ? fetchLinkFacts(link) : Promise.resolve<StudioLinkFacts | null>(null),
    input.postId ? loadCurrent(viewer, brand.id, input.postId) : Promise.resolve(null),
    activePlatforms(viewer, brand.id),
    recentHistory(brand.id, viewer.user.id),
  ])
  const platforms: SocialPlatform[] = input.settings.platforms.length
    ? input.settings.platforms
    : connected.length
      ? connected
      : ['instagram', 'facebook']
  const allowedFormats = formatsForPlatforms(platforms)
  const design = await resolveDesign(brand)
  const context = await buildBrandContext(brand, input.text.slice(0, 500), input.settings.locale)
  const slideCount = current?.design?.copy?.slides.length ?? 0
  const currentForPrompt: StudioCurrentPost | null = current
    ? {
        title: current.view.title,
        format: current.format,
        status: current.view.statusLabel,
        editable: current.editable,
        caption: current.view.masterText,
        firstComment: current.view.firstComment,
        slides: current.design?.copy
          ? current.design.copy.slides.map((s) => ({ title: s.title, body: s.body ?? null }))
          : null,
      }
    : null
  const prompt = buildStudioPrompt({
    brand: context,
    brandLocale: toContentLocale(brand.content_locale),
    locale: input.settings.locale ?? null,
    platforms,
    allowedFormats,
    format: input.settings.format,
    styleName: STYLE_NAMES[design.styleId]?.name ?? design.styleId,
    styles: STYLE_IDS.map((id) => ({ id, name: STYLE_NAMES[id]?.name ?? id })),
    history,
    current: currentForPrompt,
    photos: photos.length,
    link: linkFacts,
    message: input.text,
    today: wallClock(startedAt, brand.timezone).date,
  })
  const images = (await Promise.all(photos.map(promptImage))).filter((i): i is ImageInput => Boolean(i))

  const price = await getTokenPrice('studio_chat')
  const { generationId, reservationId } = await startGeneration({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId: viewer.user.id,
    type: 'studio_chat',
    tokens: price,
    input: {
      message: input.text.slice(0, 500),
      photos: photos.length,
      link,
      postId: current?.view.id ?? null,
      settings: input.settings,
    },
    requestId: meta.requestId,
    idempotencyKey: meta.idempotencyKey ?? null,
  })

  let decision: NormalizedStudioDecision
  try {
    const outcome = await callWithFallback(
      await textModelChain(),
      (model) =>
        generateText({
          model,
          system: buildStudioSystemPrompt(),
          prompt,
          images: images.length ? images : undefined,
          jsonSchema: studioJsonSchema(),
          maxOutputTokens: 4096,
          temperature: 0.6,
          thinking: 'low',
        }),
      { label: 'studio-chat' },
    )
    const parsed = studioDecisionSchema.safeParse(outcome.result.json)
    if (!parsed.success)
      throw new AiError('INVALID_RESPONSE', 'Model je vratio JSON koji ne odgovara šemi.', {
        model: outcome.model,
      })
    decision = normalizeStudioDecision(parsed.data, {
      hasCurrent: Boolean(current),
      editable: current?.editable ?? false,
      slideCount,
      allowedFormats,
      hasPhotos: photos.length > 0,
    })
    const cost = await costFor(outcome.model, {
      inputTokens: outcome.result.usage.inputTokens,
      outputTokens: outcome.result.usage.outputTokens,
      thoughtTokens: outcome.result.usage.thoughtTokens,
    })
    const admin = createSupabaseAdminClient()
    await admin
      .from('ai_generations')
      .update({
        model: outcome.model,
        fallback_used: outcome.fallbackUsed,
        output: decision as unknown as NonNullable<Json>,
        duration_ms: outcome.result.durationMs,
        provider_input_tokens: outcome.result.usage.inputTokens,
        provider_output_tokens: outcome.result.usage.outputTokens + outcome.result.usage.thoughtTokens,
        cost_usd: cost,
      })
      .eq('id', generationId)
    // poruka koja pravi objavu se ne naplaćuje: plaća se tekst objave
    if (reservationId && decision.action !== 'create') await confirmReservation(reservationId)
    else {
      if (reservationId) await releaseReservation(reservationId, 'studio_create')
      await admin
        .from('ai_generations')
        .update({ status: 'succeeded', finished_at: new Date().toISOString() })
        .eq('id', generationId)
    }
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generationId, reservationId, api.code, api.message)
    throw api
  }

  let action: StoredAction = decision.action
  let tokens = decision.action === 'create' ? 0 : price
  let postId: string | null = null
  let format: PostFormat | null = null
  let notes: string[] = []
  let failure: { code: string; message: string } | null = null
  const photoIds = photos.map((p) => p.id)

  if (decision.action === 'create' && decision.brief) {
    const brief = decision.brief
    const chosen = input.settings.format !== 'auto' ? input.settings.format : brief.format
    const composeInput: ComposeInput = {
      brandId: brand.id,
      platforms,
      topic: brief.topic,
      goal: brief.goal,
      cta: brief.cta ?? undefined,
      includeHashtags: brief.hashtags,
      locale: brief.locale ?? input.settings.locale ?? undefined,
      format: chosen,
      source: 'auto',
      mediaAssetIds: photoIds.length && brief.photos === 'as_is' ? photoIds : undefined,
      photoAssetIds: photoIds.length && brief.photos === 'in_design' ? photoIds : undefined,
      linkUrl: chosen === 'link' && link ? link : undefined,
      design: true,
      styleId: brief.style ?? undefined,
      slides: brief.slides ?? undefined,
    }
    try {
      const result = await composePost(viewer, composeInput, {
        requestId: meta.requestId,
        idempotencyKey: meta.idempotencyKey ? `${meta.idempotencyKey}:post` : null,
      })
      postId = result.postId
      format = result.format
      notes = result.notes
      tokens += result.tokensCharged
    } catch (error) {
      action = 'failed'
      failure = errorOf(error)
    }
  } else if (decision.action === 'revise' && decision.revision && current) {
    try {
      await reviseStudioPost(viewer, brand, current, decision.revision)
      postId = current.view.id
      format = current.format
    } catch (error) {
      action = 'failed'
      failure = errorOf(error)
    }
  }

  const admin = createSupabaseAdminClient()
  const attachments: StudioAttachment[] = [
    ...photoIds.map((assetId) => ({ kind: 'photo' as const, assetId, url: null })),
    ...(link ? [{ kind: 'link' as const, url: link, title: linkFacts?.title ?? null }] : []),
  ]
  const assistantMeta: StoredMeta = {
    format,
    notes,
    noteCodes: decision.notes,
    suggestions: decision.suggestions,
    tokens,
    error: failure,
  }
  const { data: rows, error } = await admin
    .from('studio_messages')
    .insert([
      {
        brand_id: brand.id,
        workspace_id: brand.workspace_id,
        user_id: viewer.user.id,
        role: 'user',
        body: input.text,
        action: null,
        post_id: null,
        attachments: attachments as unknown as Json,
        meta: {},
        created_at: startedAt,
      },
      {
        brand_id: brand.id,
        workspace_id: brand.workspace_id,
        user_id: viewer.user.id,
        role: 'assistant',
        body: decision.reply,
        action,
        post_id: postId,
        // oba reda imaju sve kolone: u grupnom upisu kolona koje nema postaje NULL, ne podrazumevana
        attachments: [],
        meta: assistantMeta as unknown as Json,
        created_at: new Date(Math.max(Date.now(), Date.parse(startedAt) + 1)).toISOString(),
      },
    ])
    .select('*')
  if (error) throw mapDbError(error)
  await pruneThread(brand.id, viewer.user.id)

  const thumbs = await photoThumbs(rows ?? [])
  const ordered = (rows ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at))
  return {
    messages: ordered.map((r) => toView(r, thumbs)),
    postId: action === 'failed' ? (current?.view.id ?? null) : (postId ?? current?.view.id ?? null),
    tokensCharged: tokens,
  }
}

/** Razgovor čuva najviše `STUDIO_KEEP` poruka; starije se brišu. */
async function pruneThread(brandId: string, userId: string): Promise<void> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('studio_messages')
    .select('id')
    .eq('brand_id', brandId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(STUDIO_KEEP, STUDIO_KEEP + 99)
  if (data?.length)
    await admin
      .from('studio_messages')
      .delete()
      .in(
        'id',
        data.map((r) => r.id),
      )
}
