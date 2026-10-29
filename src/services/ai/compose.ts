import 'server-only'

import type { SocialPlatform } from '@/config/platforms'
import { formatFor, formatsForPlatforms, mediaNeed, type PostFormat } from '@/config/post-formats'
import { variantToText } from '@/lib/ai/prompts/post-text'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import type { ComposeInput } from '@/lib/schemas/ai'
import { generatePostText } from '@/services/ai/text'
import { generateTemplateVisual } from '@/services/autopilot/content'
import { getBrand } from '@/services/brands'
import { getAsset, signedUrl, type MediaAssetRow } from '@/services/media'
import { createPost } from '@/services/posts/posts'
import { listSocialAccounts } from '@/services/social/accounts'
import { pickPexelsPhotos, pickPexelsVideo } from '@/services/visuals/pexels'
import { pickUnsplashPhotos } from '@/services/visuals/unsplash'
import { toContentLocale } from '@/config/locales'

/**
 * „Nova objava” u Studiju (D-107): jezik, vrsta objave (ili AI bira) i izvor vizuala. Gemini piše
 * tekst sa heštegovima i pojmove za pretragu; fotografije dolaze sa Unsplash-a ili Pexels-a, video
 * sa Pexels-a, a šablon i Canva dizajn ostaju po izboru. Rezultat je nacrt objave sa targetima za
 * povezane naloge, koji korisnik pregleda i zakazuje. Tokeni: tekst 2, šablon 2, Unsplash i Pexels 0.
 */
export interface ComposeResult {
  postId: string
  format: PostFormat
  locale: string
  variants: Array<{ platform: string; text: string; firstComment: string | null }>
  media: Array<{ id: string; kind: string; url: string; attribution: string | null }>
  targets: number
  notes: string[]
  tokensCharged: number
}

type Picked = { asset: MediaAssetRow; attribution: string | null }

function attributionText(asset: MediaAssetRow): string | null {
  const a = asset.attribution as { text?: unknown } | null
  return typeof a?.text === 'string' ? a.text : null
}

export async function composePost(
  viewer: Viewer,
  input: ComposeInput,
  meta: { requestId: string; idempotencyKey?: string | null },
): Promise<ComposeResult> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const platforms = input.platforms as SocialPlatform[]
  const allowed = formatsForPlatforms(platforms)
  if (!allowed.length)
    throw new ApiError(
      'VALIDATION',
      'Izabrane mreže nemaju zajedničku vrstu objave. Napravite posebne objave.',
    )
  if (input.format !== 'auto' && !allowed.includes(input.format))
    throw new ApiError(
      'VALIDATION',
      'Ova vrsta objave ne ide na sve izabrane mreže. Promenite vrstu ili mreže.',
    )

  const notes: string[] = []
  const text = await generatePostText(
    viewer,
    {
      brandId: brand.id,
      platforms,
      topic: input.topic,
      goal: input.goal,
      cta: input.cta,
      includeHashtags: input.includeHashtags,
      variantsPerPlatform: 1,
      locale: input.locale,
      format: input.format,
    },
    meta,
  )
  let tokens = text.tokensCharged
  const chosen = text.output.format && allowed.includes(text.output.format) ? text.output.format : null
  const format: PostFormat =
    input.format === 'auto' ? (chosen ?? (allowed.includes('image') ? 'image' : allowed[0]!)) : input.format
  const query = (text.output.visual_query?.trim() || input.topic).slice(0, 100)
  const first = text.output.variants[0]!

  // vizual po vrsti i izvoru; kad izvor nema rezultat, prelazi se na sledeći uz napomenu
  const need = mediaNeed(format)
  const ctx = { workspaceId: brand.workspace_id, brandId: brand.id, uploadedBy: viewer.user.id }
  let media: Picked[] = []
  if (input.mediaAssetIds?.length) {
    for (const id of input.mediaAssetIds) {
      const asset = await getAsset(viewer, id)
      if (asset.brand_id && asset.brand_id !== brand.id)
        throw new ApiError('VALIDATION', 'Medij pripada drugom brendu.')
      media.push({ asset, attribution: attributionText(asset) })
    }
  } else if (need.kind === 'video') {
    const v =
      input.source === 'unsplash' || input.source === 'template'
        ? null
        : await pickPexelsVideo({ ...ctx, query, orientation: 'portrait' })
    if (v) media = [{ asset: v.asset, attribution: v.attribution.text }]
    else
      notes.push(
        'Video nije nađen (Pexels nije uključen ili nema snimka za temu). Dodajte ga iz Canve ili biblioteke.',
      )
  } else if (need.kind === 'image') {
    const crop = need.orientation === 'portrait' ? 'portrait' : 'square'
    if (input.source === 'template') {
      const photo = (await pickUnsplashPhotos({ ...ctx, query, count: 1, crop: 'square' }))[0]
      const visual = await generateTemplateVisual(brand, {
        headline: first.hook.slice(0, 80) || input.topic.slice(0, 80),
        subtext: null,
        cta: first.cta ? first.cta.slice(0, 40) : null,
        postId: null,
        runId: null,
        userId: viewer.user.id,
        aspectRatio: format === 'story' ? '9:16' : '1:1',
        photoId: photo ? ((photo.asset.source_data as { photoId?: string } | null)?.photoId ?? null) : null,
      })
      if (visual) {
        tokens += visual.tokens
        const asset = await getAsset(viewer, visual.assetId)
        media = [{ asset, attribution: photo?.attribution.text ?? null }]
      } else notes.push('Vizual iz šablona nije napravljen.')
    } else {
      const fromUnsplash = async () =>
        (await pickUnsplashPhotos({ ...ctx, query, count: need.count, crop })).map((p) => ({
          asset: p.asset,
          attribution: p.attribution.text,
        }))
      const fromPexels = async () =>
        (await pickPexelsPhotos({ ...ctx, query, count: need.count, crop })).map((p) => ({
          asset: p.asset,
          attribution: p.attribution.text,
        }))
      media = input.source === 'pexels' ? await fromPexels() : await fromUnsplash()
      if (!media.length && input.source === 'auto') media = await fromPexels()
      if (!media.length)
        notes.push('Fotografija nije nađena za ovu temu. Dodajte je iz biblioteke ili Canve.')
      else if (media.length < need.count)
        notes.push(`Nađeno je ${media.length} od ${need.count} fotografija.`)
    }
  }
  if (format === 'story')
    notes.push('Priča nema opis: tekst je sačuvan uz nacrt, a objavljuje se samo vizual.')

  // targeti za povezane i aktivne naloge izabranih mreža, tekst po mreži
  const { accounts } = await listSocialAccounts(viewer, brand.id)
  const active = accounts.filter(
    (a) => a.status === 'active' && platforms.includes(a.platform as SocialPlatform),
  )
  if (!active.length)
    notes.push('Nema povezanih naloga za izabrane mreže: nacrt je bez naloga, dodajte ih u objavi.')
  const byPlatform = new Map(text.output.variants.map((v) => [v.platform, v]))
  const targets = active.map((a) => {
    const v = byPlatform.get(a.platform as SocialPlatform) ?? first
    const targetFormat = formatFor(format, a.platform as SocialPlatform)
    return {
      socialAccountId: a.id,
      text: variantToText(v).text,
      ...(targetFormat === 'story' ? { options: { format: 'story' } } : {}),
    }
  })
  const link = format === 'link' ? (input.linkUrl ?? brand.website_url ?? undefined) : undefined
  if (format === 'link' && !link) notes.push('Link nije unet, a brend nema sajt: dodajte link u objavi.')

  const post = await createPost(viewer, {
    brandId: brand.id,
    title: first.hook.trim().slice(0, 200) || undefined,
    masterText: variantToText(first).text,
    firstComment: first.first_comment?.trim() ? first.first_comment.trim().slice(0, 2200) : undefined,
    linkUrl: link,
    language: input.locale ?? toContentLocale(brand.content_locale),
    targets,
    media: media.map((m, i) => ({ mediaAssetId: m.asset.id, sortOrder: i })),
    source: 'ai',
  })

  return {
    postId: post.id,
    format,
    locale: input.locale ?? brand.content_locale,
    variants: text.output.variants.map((v) => ({
      platform: v.platform,
      text: variantToText(v).text,
      firstComment: v.first_comment,
    })),
    media: await Promise.all(
      media.map(async (m) => ({
        id: m.asset.id,
        kind: m.asset.kind,
        url: await signedUrl(m.asset),
        attribution: m.attribution,
      })),
    ),
    targets: targets.length,
    notes,
    tokensCharged: tokens,
  }
}
