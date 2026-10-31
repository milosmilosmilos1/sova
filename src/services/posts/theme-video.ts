import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { clipPlan, THEME_VIDEO } from '@/lib/visuals/design/video'
import type { Json } from '@/types/database'
import { getBrand } from '@/services/brands'
import { parsePostDesign, type PostDesignContext } from '@/services/design/post-design'
import { getAsset, signedUrl, type MediaAssetRow } from '@/services/media'
import { loadPost, snapshotVersion } from '@/services/posts/posts'

/**
 * Video u temi u Odobravanju (D-128): pregledač uzme spisak videa koji čekaju, za svaki dobije
 * kadrove (sloj teksta, snimak i odakle snimak kreće), napravi MP4 i otpremi ga u biblioteku, a
 * ovde se MP4 kači na objavu. Tek tada objava može da se zakaže.
 */
const OPEN = ['draft', 'in_review', 'approved', 'rejected'] as const

export interface ThemeVideoScene {
  overlayUrl: string
  seconds: number
  clip: { url: string; start: number } | null
  photoUrl: string | null
}

export interface ThemeVideoSpec {
  postId: string
  version: number
  width: number
  height: number
  fps: number
  background: string
  scenes: ThemeVideoScene[]
}

type VideoDesign = PostDesignContext & { video: NonNullable<PostDesignContext['video']> }

function videoDesign(value: unknown): VideoDesign | null {
  const design = parsePostDesign(value)
  return design?.format === 'video' && design.video ? (design as VideoDesign) : null
}

/** Videi brenda koji čekaju da ih pregledač napravi (najstariji prvi). */
export async function listPendingThemeVideos(
  viewer: Viewer,
  brandId: string,
): Promise<{ items: Array<{ id: string; title: string | null }> }> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const { data, error } = await viewer.supabase
    .from('posts')
    .select('id, title, design')
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .in('status', [...OPEN])
    .eq('design->>format', 'video')
    .order('created_at')
    .limit(50)
  if (error) throw mapDbError(error)
  return {
    items: (data ?? [])
      .filter((p) => {
        const design = videoDesign(p.design)
        return design && !design.video.renderedAssetId
      })
      .map((p) => ({ id: p.id, title: p.title })),
  }
}

async function assetsOf(brandId: string, ids: string[]): Promise<Map<string, MediaAssetRow>> {
  if (!ids.length) return new Map()
  const { data } = await createSupabaseAdminClient()
    .from('media_assets')
    .select('*')
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .in('id', ids)
  return new Map((data ?? []).map((a) => [a.id, a]))
}

/** Kadrovi videa sa potpisanim linkovima: sloj teksta, snimak (od kog trenutka) ili fotografija. */
export async function getThemeVideoSpec(viewer: Viewer, postId: string): Promise<ThemeVideoSpec> {
  const post = await loadPost(viewer, postId)
  await requireMembership(viewer, post.workspace_id, EDIT_ROLES)
  const design = videoDesign(post.design)
  if (!design) throw new ApiError('VALIDATION', 'Ova objava nije video u temi.')
  const { video } = design
  const photos = design.copy?.photoAssetIds ?? []
  const assets = await assetsOf(post.brand_id, [...video.overlayAssetIds, ...video.clipAssetIds, ...photos])
  const url = async (id: string | undefined) => {
    const asset = id ? assets.get(id) : undefined
    return asset ? signedUrl(asset) : null
  }
  // snimak obrisan iz biblioteke se preskače; kadrovi se dele na snimke koji postoje
  const clips = video.clipAssetIds.filter((id) => assets.has(id))
  const plan = clipPlan(video.seconds, clips.length)
  const scenes = await Promise.all(
    video.overlayAssetIds.map(async (overlayId, i) => {
      const overlayUrl = await url(overlayId)
      if (!overlayUrl)
        throw new ApiError('CONFLICT', 'Sloj teksta za video nedostaje. Uskladite nacrt sa temom.')
      const at = plan[i] ?? { clip: null, start: 0 }
      const clipUrl = at.clip === null ? null : await url(clips[at.clip])
      return {
        overlayUrl,
        seconds: video.seconds[i] ?? 3,
        clip: clipUrl ? { url: clipUrl, start: at.start } : null,
        photoUrl: clipUrl || !photos.length ? null : await url(photos[i % photos.length]),
      }
    }),
  )
  return {
    postId,
    version: post.version,
    ...THEME_VIDEO,
    background: design.colors?.background ?? '#000000',
    scenes,
  }
}

/**
 * Gotov MP4 iz pregledača postaje medij objave. Objava koju je neko u međuvremenu izmenio (nova
 * verzija, novi slojevi) odbija stari video, pa ga pregledač pravi ponovo.
 */
export async function attachThemeVideo(
  viewer: Viewer,
  postId: string,
  input: { version: number; mediaAssetId: string },
): Promise<{ version: number }> {
  const post = await loadPost(viewer, postId)
  await requireMembership(viewer, post.workspace_id, EDIT_ROLES)
  const design = videoDesign(post.design)
  if (!design) throw new ApiError('VALIDATION', 'Ova objava nije video u temi.')
  if (!(OPEN as readonly string[]).includes(post.status))
    throw new ApiError('CONFLICT', 'Video se ne menja na zakazanoj ili objavljenoj objavi.')
  if (post.version !== input.version)
    throw new ApiError('CONFLICT', 'Objava je u međuvremenu izmenjena, pa se video pravi ponovo.')
  const asset = await getAsset(viewer, input.mediaAssetId)
  if (asset.kind !== 'video' || asset.mime_type !== 'video/mp4')
    throw new ApiError('VALIDATION', 'Za video u temi treba MP4 fajl.')
  if ((asset.brand_id && asset.brand_id !== post.brand_id) || asset.workspace_id !== post.workspace_id)
    throw new ApiError('VALIDATION', 'Video pripada drugom brendu.')

  const admin = createSupabaseAdminClient()
  const next: PostDesignContext = { ...design, video: { ...design.video, renderedAssetId: asset.id } }
  const { data: updated, error } = await admin
    .from('posts')
    .update({ design: next as unknown as Json, version: post.version + 1 })
    .eq('id', postId)
    .eq('version', post.version)
    .select('id')
  if (error) throw mapDbError(error)
  if (!updated?.length)
    throw new ApiError('CONFLICT', 'Objava je u međuvremenu izmenjena, pa se video pravi ponovo.')
  await admin.from('post_media').delete().eq('post_id', postId)
  const { error: mediaError } = await admin
    .from('post_media')
    .insert({ post_id: postId, media_asset_id: asset.id, sort_order: 0 })
  if (mediaError) throw mapDbError(mediaError)
  await snapshotVersion(postId, post.version + 1, 'Video napravljen u pregledaču', viewer.user.id)
  return { version: post.version + 1 }
}
