import 'server-only'

import { isContentLocale } from '@/config/locales'
import type { SocialPlatform } from '@/config/platforms'
import { PLATFORM_FORMATS } from '@/config/post-formats'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { getAsset } from '@/services/media'
import { createPost, getPostView } from '@/services/posts/posts'
import { systemSubmitForReview } from '@/services/posts/system'
import type { Json } from '@/types/database'

/**
 * Video iz karusela (D-118): pregledač napravi MP4 od slajdova i otpremi ga u biblioteku, a ovde
 * nastaje nov nacrt sa istim opisom i nalozima koji primaju video (Google profil ne prima). Karusel
 * ostaje kakav je. Nacrt iz odobravanja ide u isti red, bez novog obaveštenja.
 */
export async function createVideoDraft(
  viewer: Viewer,
  postId: string,
  mediaAssetId: string,
): Promise<{ postId: string; status: 'draft' | 'in_review'; targets: number }> {
  const source = await getPostView(viewer, postId)
  await requireMembership(viewer, source.workspaceId, EDIT_ROLES)
  const asset = await getAsset(viewer, mediaAssetId)
  if (asset.kind !== 'video') throw new ApiError('VALIDATION', 'Za video nacrt treba video fajl.')
  if ((asset.brand_id && asset.brand_id !== source.brandId) || asset.workspace_id !== source.workspaceId)
    throw new ApiError('VALIDATION', 'Video pripada drugom brendu.')
  const targets = source.targets
    .filter((t) => PLATFORM_FORMATS[t.platform as SocialPlatform]?.includes('video'))
    .map((t) => {
      // priča postaje Reel: video ide kao obična video objava
      const { format: _format, ...options } = t.options as Record<string, Json>
      return { socialAccountId: t.socialAccountId, text: t.usesMaster ? undefined : t.text, options }
    })
  const post = await createPost(viewer, {
    brandId: source.brandId,
    title: source.title ? `${source.title} (video)`.slice(0, 200) : undefined,
    masterText: source.masterText,
    firstComment: source.firstComment ?? undefined,
    language: isContentLocale(source.language) ? source.language : undefined,
    targets,
    media: [{ mediaAssetId: asset.id, sortOrder: 0 }],
    source: 'ai',
  })
  if (source.status !== 'in_review') return { postId: post.id, status: 'draft', targets: targets.length }
  await systemSubmitForReview(post.id, 'Video iz karusela čeka odluku', { notify: false })
  return { postId: post.id, status: 'in_review', targets: targets.length }
}
