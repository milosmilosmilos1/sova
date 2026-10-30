import 'server-only'

import { toContentLocale } from '@/config/locales'
import type { SocialPlatform } from '@/config/platforms'
import { formatFor, type PostFormat } from '@/config/post-formats'
import type { DesignedFormat } from '@/lib/ai/prompts/carousel'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import type { ComposeInput } from '@/lib/schemas/ai'
import { wallClock } from '@/lib/zoned-time'
import type { Slide } from '@/lib/visuals/design/types'
import { assertDailyQuota } from '@/services/ai/generations'
import { buildBrandContext } from '@/services/ai/text'
import type { BrandRow } from '@/services/brands'
import { getAsset, signedUrl } from '@/services/media'
import { createPost } from '@/services/posts/posts'
import { listSocialAccounts } from '@/services/social/accounts'

import { resolveDesign } from './brand-design'
import { captionFor, generateDesignedCopy } from './copy'
import { renderDesignSlides } from './render-post'

/**
 * „Nova objava” sa dizajnom (D-108): Gemini piše slajdove i opis, stil brenda crta slajdove, a
 * fotografije su besplatne (Unsplash, Pexels) ili iz galerije. 2 tokena za tekst, slajdovi 0.
 */
export interface DesignedComposeResult {
  postId: string
  format: PostFormat
  locale: string
  variants: Array<{ platform: string; text: string; firstComment: string | null }>
  media: Array<{ id: string; kind: string; url: string; attribution: string | null }>
  targets: number
  notes: string[]
  tokensCharged: number
  styleId: string
  slides: Slide[]
}

/** Vrsta dizajnirane objave za izbor u formi; null kad mreže ne primaju sliku (npr. samo YouTube). */
export function designedFormatFor(
  format: ComposeInput['format'],
  allowed: PostFormat[],
): DesignedFormat | null {
  if (format === 'carousel') return 'carousel'
  if (format === 'image') return 'single'
  if (format === 'story') return 'story'
  if (format === 'auto')
    return allowed.includes('carousel') ? 'auto' : allowed.includes('image') ? 'single' : null
  return null
}

export async function composeDesigned(
  viewer: Viewer,
  brand: BrandRow,
  input: ComposeInput,
  dFormat: DesignedFormat,
  meta: { requestId: string; idempotencyKey?: string | null },
): Promise<DesignedComposeResult> {
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  await assertDailyQuota(brand.workspace_id)
  const platforms = input.platforms as SocialPlatform[]
  const design = await resolveDesign(brand)
  const slides =
    dFormat === 'single'
      ? 1
      : dFormat === 'story'
        ? Math.min(input.slides ?? 1, 5)
        : (input.slides ?? design.slides)
  const context = await buildBrandContext(brand, input.topic, input.locale)
  const copy = await generateDesignedCopy({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId: viewer.user.id,
    context,
    topic: input.topic,
    cta: input.cta ?? null,
    format: dFormat,
    slides,
    platforms,
    includeHashtags: input.includeHashtags,
    publishDate: wallClock(new Date().toISOString(), brand.timezone).date,
    requestId: meta.requestId,
    idempotencyKey: meta.idempotencyKey ?? null,
    origin: { studio: true },
  })
  const format: PostFormat =
    dFormat === 'story'
      ? 'story'
      : dFormat === 'carousel'
        ? 'carousel'
        : copy.slides.length > 1
          ? 'carousel'
          : 'image'
  const styleId = input.styleId ?? design.styleId
  const rendered = await renderDesignSlides({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    design,
    styleId,
    format: format === 'story' ? 'story' : (input.size ?? design.size),
    slides: copy.slides,
    photoSource: input.photoSource ?? design.photoSource,
    query: (copy.visualQuery || input.topic).slice(0, 100),
    uploadedBy: viewer.user.id,
  })
  const notes = [...rendered.notes]
  if (format === 'story') notes.push('Priča nema opis: tekst je sačuvan uz nacrt, a objavljuju se slajdovi.')

  const { accounts } = await listSocialAccounts(viewer, brand.id)
  const active = accounts.filter(
    (a) => a.status === 'active' && platforms.includes(a.platform as SocialPlatform),
  )
  if (!active.length)
    notes.push('Nema povezanih naloga za izabrane mreže: nacrt je bez naloga, dodajte ih u objavi.')
  const targets = active.map((a) => {
    const platform = a.platform as SocialPlatform
    return {
      socialAccountId: a.id,
      text: captionFor(copy, platform),
      ...(formatFor(format, platform) === 'story' ? { options: { format: 'story' } } : {}),
    }
  })
  const locale = input.locale ?? toContentLocale(brand.content_locale)
  const post = await createPost(viewer, {
    brandId: brand.id,
    title: copy.slides[0]?.title.slice(0, 200) || undefined,
    masterText: captionFor(copy, 'instagram'),
    firstComment: copy.firstComment ? copy.firstComment.slice(0, 2200) : undefined,
    language: locale,
    targets,
    media: rendered.assetIds.map((mediaAssetId, sortOrder) => ({ mediaAssetId, sortOrder })),
    source: 'ai',
  })
  const media = await Promise.all(
    rendered.assetIds.map(async (id) => {
      const asset = await getAsset(viewer, id)
      return { id, kind: asset.kind, url: await signedUrl(asset), attribution: null }
    }),
  )
  return {
    postId: post.id,
    format,
    locale,
    variants: platforms.map((p) => ({
      platform: p,
      text: captionFor(copy, p),
      firstComment: copy.firstComment,
    })),
    media,
    targets: targets.length,
    notes,
    tokensCharged: copy.tokens,
    styleId,
    slides: copy.slides,
  }
}
