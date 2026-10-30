import 'server-only'

import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import type { PostStatus } from '@/lib/posts/state-machine'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import type { Slide } from '@/lib/visuals/design/types'
import { zipStore } from '@/lib/zip'
import { buildBrandContext } from '@/services/ai/text'
import { getBrand } from '@/services/brands'
import { resolveDesign } from '@/services/design/brand-design'
import { captionFor, generateDesignedCopy } from '@/services/design/copy'
import { parsePostDesign } from '@/services/design/post-design'
import { renderDesignSlides } from '@/services/design/render-post'
import { downloadAsset, signedUrl } from '@/services/media'
import { nextFreeSlot } from '@/services/posts/calendar'
import { getPostView, updatePost, type PostView } from '@/services/posts/posts'
import {
  cancelPost,
  decidePost,
  publishNow,
  schedulePost,
  withdrawFromReview,
} from '@/services/posts/workflow'

/**
 * Odobravanje (D-108, faza 4): nacrti koji čekaju odluku, pregled slajdova i opisa po mreži, i
 * brze odluke: sačuvaj i zakaži, objavi odmah, generiši ponovo, preskoči, preuzmi slajdove.
 * Sve odluke idu kroz postojeći state machine (`workflow.ts`), sa istim pravima i proverama.
 */
export const REVIEW_TABS = ['waiting', 'approved', 'published', 'skipped', 'all'] as const
export type ReviewTab = (typeof REVIEW_TABS)[number]

const TAB_STATUSES: Record<ReviewTab, PostStatus[] | null> = {
  waiting: ['in_review'],
  approved: ['approved', 'scheduled', 'paused'],
  published: ['published', 'partially_published'],
  skipped: ['canceled', 'rejected'],
  all: null,
}

export type ReviewFormat = 'carousel' | 'single' | 'story' | 'video' | 'text'

export interface ReviewItem {
  id: string
  title: string | null
  status: PostStatus
  format: ReviewFormat
  slides: number
  thumb: string | null
  flowName: string | null
  platforms: SocialPlatform[]
  scheduledFor: string | null
  createdAt: string
}

function formatOf(media: Array<{ kind: string }>, story: boolean): ReviewFormat {
  if (!media.length) return 'text'
  if (story) return 'story'
  if (media.length === 1 && media[0]!.kind === 'video') return 'video'
  return media.length > 1 ? 'carousel' : 'single'
}

export async function listReviewDesk(
  viewer: Viewer,
  input: { brandId: string; tab: ReviewTab; q?: string; format?: ReviewFormat; sort?: 'new' | 'old' },
): Promise<{ items: ReviewItem[]; counts: Record<ReviewTab, number> }> {
  await getBrand(viewer, input.brandId)
  const { data, error } = await viewer.supabase
    .from('posts')
    .select(
      'id, title, master_text, status, scheduled_for, created_at, flow_id, content_flows(name), post_targets(platform, options), post_media(sort_order, media_assets(kind, bucket, storage_path, mime_type))',
    )
    .eq('brand_id', input.brandId)
    .is('deleted_at', null)
    .order('created_at', { ascending: input.sort === 'old' })
    .limit(300)
  if (error) throw mapDbError(error)
  const rows = data ?? []
  const counts = Object.fromEntries(
    REVIEW_TABS.map((t) => [
      t,
      rows.filter((r) => !TAB_STATUSES[t] || TAB_STATUSES[t]!.includes(r.status)).length,
    ]),
  ) as Record<ReviewTab, number>
  const q = input.q?.trim().toLowerCase()
  const statuses = TAB_STATUSES[input.tab]
  const picked = rows
    .filter((r) => !statuses || statuses.includes(r.status))
    .filter((r) => !q || `${r.title ?? ''} ${r.master_text}`.toLowerCase().includes(q))
    .map((r) => {
      const targets = (r.post_targets ?? []) as Array<{
        platform: SocialPlatform
        options: Record<string, unknown> | null
      }>
      const media = (
        (r.post_media ?? []) as unknown as Array<{
          sort_order: number
          media_assets: { kind: string; bucket: string; storage_path: string; mime_type: string } | null
        }>
      )
        .filter((m) => m.media_assets)
        .sort((a, b) => a.sort_order - b.sort_order)
      const story = targets.some((t) => t.options?.format === 'story')
      return {
        r,
        targets,
        media,
        format: formatOf(
          media.map((m) => m.media_assets!),
          story,
        ),
      }
    })
    .filter((x) => !input.format || x.format === input.format)
    .slice(0, 100)
  const items = await Promise.all(
    picked.map(async ({ r, targets, media, format }) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      format,
      slides: media.length,
      thumb: media[0]?.media_assets
        ? await signedUrl(media[0].media_assets as never).catch(() => null)
        : null,
      flowName: (r.content_flows as unknown as { name: string } | null)?.name ?? null,
      platforms: [...new Set(targets.map((t) => t.platform))],
      scheduledFor: r.scheduled_for,
      createdAt: r.created_at,
    })),
  )
  return { items, counts }
}

export interface ReviewDetail {
  post: PostView
  flowName: string | null
  canRegenerate: boolean
  /** predlog termina: sledeći slobodan termin iz reda objava ili sutra u 10:00 po zoni brenda */
  suggestedAt: string
  limits: Record<string, number>
}

export async function getReviewDetail(viewer: Viewer, postId: string): Promise<ReviewDetail> {
  const post = await getPostView(viewer, postId)
  const admin = createSupabaseAdminClient()
  const { data: row } = await admin
    .from('posts')
    .select('flow_id, design, content_flows(name)')
    .eq('id', postId)
    .maybeSingle()
  const brand = await getBrand(viewer, post.brandId)
  let suggested: string | null = null
  for (const t of post.targets) {
    const slot = await nextFreeSlot(viewer, brand.id, t.socialAccountId).catch(() => null)
    if (slot && (!suggested || slot < suggested)) suggested = slot
  }
  if (!suggested) {
    const tomorrow = new Date(Date.now() + 86_400_000)
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: brand.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(tomorrow)
    const { zonedToUtc } = await import('@/lib/zoned-time')
    suggested = zonedToUtc(date, '10:00', brand.timezone)
  }
  return {
    post,
    flowName: (row?.content_flows as unknown as { name: string } | null)?.name ?? null,
    canRegenerate:
      Boolean(parsePostDesign(row?.design)) &&
      ['draft', 'in_review', 'rejected', 'canceled'].includes(post.status),
    suggestedAt: suggested,
    limits: Object.fromEntries(
      post.targets.map((t) => [t.platform, PLATFORMS[t.platform as SocialPlatform]?.textMax ?? 2200]),
    ),
  }
}

export interface DeskEdits {
  version: number
  masterText?: string
  firstComment?: string | null
  /** tekst po mreži; prazno = master tekst */
  texts?: Record<string, string>
}

async function applyEdits(viewer: Viewer, postId: string, edits: DeskEdits): Promise<PostView> {
  const view = await getPostView(viewer, postId)
  if (view.version !== edits.version)
    throw new ApiError('CONFLICT', 'Objavu je u međuvremenu neko izmenio. Osvežite je pa pokušajte ponovo.')
  const textsChanged =
    edits.texts &&
    view.targets.some(
      (t) =>
        edits.texts![t.socialAccountId] !== undefined &&
        edits.texts![t.socialAccountId] !== (t.usesMaster ? '' : t.text),
    )
  const changed =
    (edits.masterText !== undefined && edits.masterText !== view.masterText) ||
    (edits.firstComment !== undefined && edits.firstComment !== view.firstComment) ||
    textsChanged
  if (!changed) return view
  return updatePost(viewer, postId, {
    version: view.version,
    masterText: edits.masterText,
    firstComment: edits.firstComment,
    targets: textsChanged
      ? view.targets.map((t) => {
          const text = edits.texts![t.socialAccountId]
          return {
            socialAccountId: t.socialAccountId,
            text: text === undefined ? (t.usesMaster ? undefined : t.text) : text || undefined,
            options: t.options,
          }
        })
      : undefined,
    changeSummary: 'Izmene u odobravanju',
  })
}

/** Izmene, odobrenje (ako čeka) i zakazivanje u jednom potezu. */
export async function saveAndSchedule(
  viewer: Viewer,
  postId: string,
  input: DeskEdits & { scheduledFor: string },
): Promise<PostView> {
  let view = await applyEdits(viewer, postId, input)
  if (view.status === 'in_review') view = await decidePost(viewer, postId, view.version, 'approved', null)
  return schedulePost(viewer, postId, { version: view.version, scheduledFor: input.scheduledFor })
}

export async function publishFromDesk(viewer: Viewer, postId: string, input: DeskEdits): Promise<PostView> {
  let view = await applyEdits(viewer, postId, input)
  if (view.status === 'in_review') view = await decidePost(viewer, postId, view.version, 'approved', null)
  return publishNow(viewer, postId, view.version)
}

export async function saveDeskEdits(viewer: Viewer, postId: string, input: DeskEdits): Promise<PostView> {
  return applyEdits(viewer, postId, input)
}

/** Nacrt koji čeka odobrenje se prvo vraća u nacrte, pa otkazuje (state machine ne otkazuje iz odobravanja). */
export async function skipPost(viewer: Viewer, postId: string, version: number): Promise<PostView> {
  const view = await getPostView(viewer, postId)
  if (view.status === 'in_review') {
    const withdrawn = await withdrawFromReview(viewer, postId, version)
    return cancelPost(viewer, postId, withdrawn.version)
  }
  return cancelPost(viewer, postId, version)
}

/**
 * „Generiši ponovo”: nov tekst (2 tokena) i novi slajdovi po istom kontekstu (tema, stil, format).
 * Stari slajdovi ostaju u biblioteci; objava dobija novu verziju sa istorijom.
 */
export async function regeneratePost(viewer: Viewer, postId: string, version: number): Promise<PostView> {
  const view = await getPostView(viewer, postId)
  const brand = await getBrand(viewer, view.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  if (view.version !== version)
    throw new ApiError('CONFLICT', 'Objavu je u međuvremenu neko izmenio. Osvežite je pa pokušajte ponovo.')
  if (!['draft', 'in_review', 'rejected', 'canceled'].includes(view.status))
    throw new ApiError('CONFLICT', 'Zakazana ili objavljena objava se ne generiše ponovo. Prvo je otkažite.')
  const { data: row } = await createSupabaseAdminClient()
    .from('posts')
    .select('design')
    .eq('id', postId)
    .single()
  const ctx = parsePostDesign(row?.design)
  if (!ctx)
    throw new ApiError(
      'VALIDATION',
      'Ova objava nije napravljena iz teme, pa nema šta da se generiše ponovo.',
    )
  const context = await buildBrandContext(brand, ctx.topic, ctx.locale)
  const copy = await generateDesignedCopy({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId: viewer.user.id,
    context,
    topic: ctx.topic,
    cta: ctx.cta,
    format: ctx.format,
    slides: ctx.slides,
    platforms: ctx.platforms,
    dmCta: ctx.dmCta,
    origin: { regenerate: postId },
  })
  const design = await resolveDesign(brand)
  const rendered = await renderDesignSlides({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    design,
    styleId: ctx.styleId,
    format: ctx.format === 'story' ? 'story' : ctx.size,
    slides: copy.slides as Slide[],
    photoSource: ctx.photoSource,
    query: (copy.visualQuery || ctx.topic).slice(0, 100),
    uploadedBy: viewer.user.id,
    origin: { postId },
  })
  return updatePost(viewer, postId, {
    version: view.version,
    title: copy.slides[0]?.title.slice(0, 200) ?? view.title,
    masterText: captionFor(copy, 'instagram'),
    firstComment: copy.firstComment,
    targets: view.targets.map((t) => ({
      socialAccountId: t.socialAccountId,
      text: captionFor(copy, t.platform as SocialPlatform),
      options: t.options,
    })),
    media: rendered.assetIds.map((mediaAssetId, sortOrder) => ({ mediaAssetId, sortOrder })),
    changeSummary: 'Generisano ponovo',
  })
}

/** Slajdovi objave kao ZIP (01.jpg, 02.jpg …), redom kao u objavi. */
export async function downloadPostZip(
  viewer: Viewer,
  postId: string,
): Promise<{ name: string; bytes: Buffer }> {
  const view = await getPostView(viewer, postId)
  const { data } = await createSupabaseAdminClient()
    .from('post_media')
    .select('sort_order, media_assets(bucket, storage_path, mime_type)')
    .eq('post_id', postId)
    .order('sort_order')
  const files = await Promise.all(
    (data ?? []).map(async (m, i) => {
      const asset = m.media_assets as unknown as { bucket: string; storage_path: string; mime_type: string }
      const ext =
        asset.mime_type === 'image/png' ? 'png' : asset.mime_type.startsWith('video') ? 'mp4' : 'jpg'
      return { name: `${String(i + 1).padStart(2, '0')}.${ext}`, data: await downloadAsset(asset) }
    }),
  )
  if (!files.length) throw new ApiError('NOT_FOUND', 'Objava nema slajdove za preuzimanje.')
  const slug =
    (view.title ?? 'objava')
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 40)
      .toLowerCase() || 'objava'
  return { name: `${slug}.zip`, bytes: zipStore(files) }
}
