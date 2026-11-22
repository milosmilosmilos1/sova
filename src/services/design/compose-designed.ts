import 'server-only'

import { randomUUID } from 'node:crypto'

import { toContentLocale } from '@/config/locales'
import type { SocialPlatform } from '@/config/platforms'
import { formatFor, type PostFormat } from '@/config/post-formats'
import type { DesignedFormat } from '@/lib/ai/prompts/carousel'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import type { ComposeInput } from '@/lib/schemas/ai'
import { wallClock } from '@/lib/zoned-time'
import { styleForPhotos } from '@/lib/visuals/design'
import type { StyleId } from '@/lib/visuals/design/catalog'
import type { Slide } from '@/lib/visuals/design/types'
import { variantFor } from '@/lib/visuals/design/variants'
import { assertDailyQuota } from '@/services/ai/generations'
import { buildBrandContext } from '@/services/ai/text'
import type { BrandRow } from '@/services/brands'
import type { PhotoCredit } from '@/lib/media/unsplash'
import { getAsset, signedUrl } from '@/services/media'
import { creditsFor } from '@/services/media-credit'
import { createPost } from '@/services/posts/posts'
import { listSocialAccounts } from '@/services/social/accounts'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/database'

import type { KindTarget } from '@/lib/content-kinds'
import { applyReviewCopy, kindCopyLines } from '@/lib/content-kinds/copy'
import { kindPhotoPlan } from '@/lib/content-kinds/photos'

import { resolveDesign } from './brand-design'
import { themeOf, type PostDesignContext } from './post-design'
import { captionFor, generateDesignedCopy } from './copy'
import { renderDesignSlides } from './render-post'

/**
 * „Nova objava” sa dizajnom (D-108): Gemini piše slajdove i opis, stil brenda crta slajdove, a
 * fotografije su besplatne (Pexels; Unsplash samo kad ga korisnik izabere, D-190) ili iz galerije.
 * 2 tokena za tekst, slajdovi 0.
 */
export interface DesignedComposeResult {
  postId: string
  format: PostFormat
  locale: string
  variants: Array<{ platform: string; text: string; firstComment: string | null }>
  media: Array<{
    id: string
    kind: string
    url: string
    attribution: string | null
    /** autor i Unsplash za slajd preko fotografije koju je korisnik izabrao sa Unsplash-a (D-190) */
    credit: PhotoCredit | null
  }>
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
  /** sadržaj brenda (D-165): uputstvo, citat utiska i prave fotografije osobe i rada */
  target: KindTarget | null = null,
): Promise<DesignedComposeResult> {
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  await assertDailyQuota(brand.workspace_id)
  const platforms = input.platforms as SocialPlatform[]
  // priložene fotografije (D-116) se proveravaju pre naplate teksta
  const photoIds: string[] = []
  for (const id of input.photoAssetIds ?? []) {
    const asset = await getAsset(viewer, id)
    if ((asset.brand_id && asset.brand_id !== brand.id) || asset.kind !== 'image')
      throw new ApiError('VALIDATION', 'Za slajdove možete priložiti samo fotografije ovog brenda.')
    photoIds.push(asset.id)
  }
  const design = await resolveDesign(brand)
  const slides =
    target?.kind === 'before_after'
      ? 3
      : dFormat === 'single'
        ? 1
        : dFormat === 'story'
          ? Math.min(input.slides ?? 1, 5)
          : (input.slides ?? design.slides)
  const locale = input.locale ?? toContentLocale(brand.content_locale)
  const context = await buildBrandContext(brand, input.topic, input.locale)
  const raw = await generateDesignedCopy({
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
    origin: { studio: true, ...(target ? { kind: target.kind } : {}) },
    kindLines: target ? kindCopyLines(target, 'designed') : undefined,
  })
  // utisak klijenta: citat na slajdu i u opisu je tačno ono što je klijent napisao
  const copy = target?.kind === 'review' ? applyReviewCopy(raw, target.item, locale) : raw
  const format: PostFormat =
    dFormat === 'story'
      ? 'story'
      : dFormat === 'carousel'
        ? 'carousel'
        : copy.slides.length > 1
          ? 'carousel'
          : 'image'
  const baseStyle = input.styleId ?? design.styleId
  // ritam teme (D-132); stil koji je korisnik izričito izabrao za ovu objavu ostaje u osnovnom rasporedu
  const variant = input.styleId ? 0 : variantFor(randomUUID())
  // priložena fotografija traži stil koji je crta: tipografski stil bez fotografije prelazi na „Poster”;
  // osoba iz tima i pre i posle (D-165) idu samo sa svojim fotografijama, utisak bez tuđih
  const kindPhotos = target
    ? kindPhotoPlan(target, baseStyle, { template: Boolean(design.template), ownPhotos: photoIds })
    : null
  const styleId: StyleId = kindPhotos?.styleId ?? styleForPhotos(baseStyle, photoIds.length > 0)
  const photos = kindPhotos?.photoAssetIds ?? photoIds
  const photoSource = kindPhotos?.photoSource ?? input.photoSource ?? design.photoSource
  const rendered = await renderDesignSlides({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    design,
    styleId,
    format: format === 'story' ? 'story' : (input.size ?? design.size),
    slides: copy.slides,
    photoSource,
    query: (copy.visualQuery || input.topic).slice(0, 100),
    uploadedBy: viewer.user.id,
    // tema za proveru fotografija (D-167): fotografija mora da prikazuje ono o čemu je objava
    topic: [input.topic, ...copy.slides.map((s) => s.title)].join(' '),
    photoAssetIds: photos.length ? photos : undefined,
    cyclePhotos: !kindPhotos && photoIds.length > 0,
    variant,
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
  // „Generiši ponovo” u odobravanju piše nov tekst istim stilom (migracija 032)
  const designContext: PostDesignContext = {
    topic: input.topic,
    cta: input.cta ?? null,
    format: format === 'story' ? 'story' : format === 'carousel' ? 'carousel' : 'single',
    styleId,
    slides: copy.slides.length,
    photoSource,
    size: input.size ?? design.size,
    ...themeOf(design),
    variant,
    locale,
    platforms,
    ...(photos.length ? { ownPhotos: true } : {}),
    ...(copy.visualQuery ? { photoQuery: copy.visualQuery.slice(0, 200) } : {}),
    copy: { slides: copy.slides, photoAssetIds: rendered.photoIds },
  }
  await createSupabaseAdminClient()
    .from('posts')
    .update({ design: designContext as unknown as Json })
    .eq('id', post.id)
  const slideAssets = await Promise.all(rendered.assetIds.map((id) => getAsset(viewer, id)))
  const credits = await creditsFor(slideAssets)
  const media = await Promise.all(
    slideAssets.map(async (asset) => ({
      id: asset.id,
      kind: asset.kind,
      url: await signedUrl(asset),
      attribution: null,
      credit: credits.get(asset.id) ?? null,
    })),
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
