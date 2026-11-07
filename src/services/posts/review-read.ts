import 'server-only'

import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import type { Viewer } from '@/lib/auth/viewer'
import type { PostStatus } from '@/lib/posts/state-machine'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { getBrand } from '@/services/brands'
import { parsePostDesign } from '@/services/design/post-design'
import { signedUrl } from '@/services/media-urls'
import { listQueueSlots, nextFreeSlotFor } from '@/services/posts/calendar'
import { getPostView, type PostView } from '@/services/posts/posts'

/**
 * Čitanje odobravanja (D-108): nacrti po karticama i pregled jednog nacrta. Odvojeno od odluka i
 * crtanja (`review.ts`), da lista, pregled i početna ne učitavaju crtanje slajdova, video i AI na
 * hladnom startu (D-164).
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
  thumbKind: 'image' | 'video'
  flowName: string | null
  platforms: SocialPlatform[]
  scheduledFor: string | null
  createdAt: string
  /** video u temi koji pregledač još nije napravio (D-128) */
  videoPending: boolean
}

/** Video u temi iz `posts.design` (D-128): slika za listu i da li MP4 već postoji. */
interface StoredVideo {
  posterAssetId?: string | null
  renderedAssetId?: string | null
}

function formatOf(media: Array<{ kind: string }>, story: boolean): ReviewFormat {
  if (!media.length) return 'text'
  if (story) return 'story'
  if (media.length === 1 && media[0]!.kind === 'video') return 'video'
  return media.length > 1 ? 'carousel' : 'single'
}

export async function listReviewDesk(
  viewer: Viewer,
  input: {
    brandId: string
    tab: ReviewTab
    q?: string
    format?: ReviewFormat
    sort?: 'new' | 'old'
    /** koliko stavki vraća (sa sličicom); početna traži samo prve tri */
    limit?: number
  },
): Promise<{ items: ReviewItem[]; counts: Record<ReviewTab, number> }> {
  // provera brenda u istom krugu kao lista (D-164): upit ide kroz RLS, a bez pristupa poziv pada sa 404.
  // Broj nacrta koji čekaju je tačan (ne iz 300 redova liste), jer ga prikazuje i meni.
  const [, { data, error }, waiting] = await Promise.all([
    getBrand(viewer, input.brandId),
    viewer.supabase
      .from('posts')
      .select(
        'id, title, master_text, status, scheduled_for, created_at, flow_id, content_flows(name), post_targets(platform, options), post_media(sort_order, media_assets(kind, bucket, storage_path, mime_type)), video:design->video, designFormat:design->>format',
      )
      .eq('brand_id', input.brandId)
      .is('deleted_at', null)
      .order('created_at', { ascending: input.sort === 'old' })
      .limit(300),
    viewer.supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', input.brandId)
      .in('status', TAB_STATUSES.waiting!)
      .is('deleted_at', null),
  ])
  if (error) throw mapDbError(error)
  const rows = data ?? []
  const counts = Object.fromEntries(
    REVIEW_TABS.map((t) => [
      t,
      rows.filter((r) => !TAB_STATUSES[t] || TAB_STATUSES[t]!.includes(r.status)).length,
    ]),
  ) as Record<ReviewTab, number>
  if (!waiting.error && waiting.count !== null) counts.waiting = waiting.count
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
      const video = r.designFormat === 'video' ? ((r.video as StoredVideo | null) ?? {}) : null
      return {
        r,
        targets,
        media,
        video,
        format: video
          ? ('video' as const)
          : formatOf(
              media.map((m) => m.media_assets!),
              story,
            ),
      }
    })
    .filter((x) => !input.format || x.format === input.format)
    .slice(0, Math.min(input.limit ?? 100, 100))
  // slika videa u temi dok pregledač ne napravi MP4 (D-128)
  const posterIds = picked.flatMap(({ video, media }) =>
    video?.posterAssetId && !media.length ? [video.posterAssetId] : [],
  )
  const { data: posters } = posterIds.length
    ? await createSupabaseAdminClient()
        .from('media_assets')
        .select('id, bucket, storage_path')
        .eq('brand_id', input.brandId)
        .in('id', posterIds)
    : { data: [] }
  const posterOf = new Map((posters ?? []).map((a) => [a.id, a]))
  const items = await Promise.all(
    picked.map(async ({ r, targets, media, format, video }) => {
      const poster = !media.length && video?.posterAssetId ? posterOf.get(video.posterAssetId) : undefined
      return {
        id: r.id,
        title: r.title,
        status: r.status,
        format,
        slides: video ? 1 : media.length,
        thumb: media[0]?.media_assets
          ? await signedUrl(media[0].media_assets as never).catch(() => null)
          : poster
            ? await signedUrl(poster).catch(() => null)
            : null,
        thumbKind: media[0]?.media_assets?.kind === 'video' ? ('video' as const) : ('image' as const),
        videoPending: Boolean(video && !video.renderedAssetId),
        flowName: (r.content_flows as unknown as { name: string } | null)?.name ?? null,
        platforms: [...new Set(targets.map((t) => t.platform))],
        scheduledFor: r.scheduled_for,
        createdAt: r.created_at,
      }
    }),
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
  /** video u temi (D-128): da li MP4 još čeka pregledač i slika videa do tada */
  video: { pending: boolean; posterUrl: string | null } | null
  /** tekst na slikama može da se menja (D-129): slike je nacrtala Sova, a objava još nije zakazana */
  canEditText: boolean
}

export async function getReviewDetail(viewer: Viewer, postId: string): Promise<ReviewDetail> {
  const admin = createSupabaseAdminClient()
  // Dizajn objave (admin klijent) ide u istom krugu kao pregled, a koristi se tek kad getPostView potvrdi
  // pristup. Čim stigne id brenda, kreću i brend i termini reda (kroz RLS), dok pregled još radi (D-164).
  const rowP = Promise.resolve(
    admin
      .from('posts')
      .select('flow_id, brand_id, design, content_flows(name)')
      .eq('id', postId)
      .maybeSingle(),
  )
  const earlyP = rowP
    .then(async ({ data }) =>
      data
        ? await Promise.all([getBrand(viewer, data.brand_id), listQueueSlots(viewer, data.brand_id)])
        : null,
    )
    .catch(() => null)
  // slika videa u temi dok pregledač ne napravi MP4 (D-128); vraća se tek posle provere pristupa
  const posterP = rowP
    .then(async ({ data }) => {
      const d = parsePostDesign(data?.design)
      const posterId =
        d?.format === 'video' && d.video && !d.video.renderedAssetId ? d.video.posterAssetId : null
      if (!data || !posterId) return null
      const { data: poster } = await admin
        .from('media_assets')
        .select('bucket, storage_path')
        .eq('id', posterId)
        .eq('brand_id', data.brand_id)
        .maybeSingle()
      return poster ? await signedUrl(poster).catch(() => null) : null
    })
    .catch(() => null)
  const [post, { data: row }, early] = await Promise.all([getPostView(viewer, postId), rowP, earlyP])
  // bez termina reda (i kad čitanje ne uspe) predlog je sutra u 10:00, kao ranije
  const [brand, slots] =
    early && early[0].id === post.brandId
      ? early
      : await Promise.all([
          getBrand(viewer, post.brandId),
          listQueueSlots(viewer, post.brandId).catch(() => []),
        ])
  let suggested = await nextFreeSlotFor(
    viewer,
    brand,
    post.targets.map((t) => t.socialAccountId),
    { slots },
  ).catch(() => null)
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
  const design = parsePostDesign(row?.design)
  let video: ReviewDetail['video'] = null
  if (design?.format === 'video' && design.video) {
    const pending = !design.video.renderedAssetId
    video = { pending, posterUrl: await posterP }
  }
  return {
    post,
    flowName: (row?.content_flows as unknown as { name: string } | null)?.name ?? null,
    canRegenerate: Boolean(design) && ['draft', 'in_review', 'rejected', 'canceled'].includes(post.status),
    suggestedAt: suggested,
    limits: Object.fromEntries(
      post.targets.map((t) => [t.platform, PLATFORMS[t.platform as SocialPlatform]?.textMax ?? 2200]),
    ),
    video,
    canEditText:
      Boolean(design?.copy?.slides.length) &&
      (design?.format !== 'video' || Boolean(design.video)) &&
      post.actions.includes('edit') &&
      !post.lockedAt,
  }
}
