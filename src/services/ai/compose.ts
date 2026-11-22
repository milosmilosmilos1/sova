import 'server-only'

import type { SocialPlatform } from '@/config/platforms'
import { isPollPlatform, normalizePoll, type PollOptions } from '@/config/poll'
import { formatFor, formatsForPlatforms, mediaNeed, type PostFormat } from '@/config/post-formats'
import { variantToText } from '@/lib/ai/prompts/post-text'
import { ApiError } from '@/lib/api/errors'
import { findTarget, isDataKind, KIND_FORMATS, type KindTarget } from '@/lib/content-kinds'
import { kindCopyLines, reviewQuoteBlock, reviewShortQuote } from '@/lib/content-kinds/copy'
import { storedContent } from '@/lib/schemas/brand-content'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { logger } from '@/lib/logger'
import type { ComposeInput } from '@/lib/schemas/ai'
import { generatePostText } from '@/services/ai/text'
import { generateTemplateVisual } from '@/services/autopilot/content'
import { getBrand } from '@/services/brands'
import { composeDesigned, designedFormatFor } from '@/services/design/compose-designed'
import type { PhotoCredit } from '@/lib/media/unsplash'
import { getAsset, type MediaAssetRow } from '@/services/media'
import { creditsFor } from '@/services/media-credit'
import { previewUrl } from '@/services/media-urls'
import { createPost } from '@/services/posts/posts'
import { listSocialAccounts } from '@/services/social/accounts'
import { pickPexelsPhotos, pickPexelsVideo } from '@/services/visuals/pexels'
import { toContentLocale } from '@/config/locales'

/**
 * „Nova objava” u Studiju (D-107): jezik, vrsta objave (ili AI bira) i izvor vizuala. Gemini piše
 * tekst sa heštegovima i pojmove za pretragu; fotografije i video dolaze sa Pexels-a (Unsplash
 * fotografiju korisnik bira sam, D-190), a šablon i Canva dizajn ostaju po izboru. Rezultat je nacrt
 * objave sa targetima za povezane naloge, koji korisnik pregleda i zakazuje. Tokeni: tekst 2, šablon 2,
 * Pexels 0.
 */
export interface ComposeResult {
  postId: string
  format: PostFormat
  locale: string
  variants: Array<{ platform: string; text: string; firstComment: string | null }>
  media: Array<{
    id: string
    kind: string
    url: string
    attribution: string | null
    /** autor i Unsplash sa linkovima, za fotografiju koju je korisnik izabrao sa Unsplash-a (D-190) */
    credit: PhotoCredit | null
  }>
  targets: number
  notes: string[]
  tokensCharged: number
  /** dizajnirana objava (D-108): stil i tekst slajdova */
  styleId?: string
  /** anketa za LinkedIn i X (D-151) */
  poll?: PollOptions
  slides?: Array<{ kind: string; title: string; body?: string | null }>
}

type Picked = { asset: MediaAssetRow; attribution: string | null }

function attributionText(asset: MediaAssetRow): string | null {
  const a = asset.attribution as { text?: unknown } | null
  return typeof a?.text === 'string' ? a.text : null
}

const KIND_GONE = 'Izabrani utisak, osoba ili rad više ne postoji u Sadržaju brenda.'
const KIND_FORMAT = 'Ova vrsta sadržaja ne ide uz izabranu vrstu objave.'

/**
 * Sadržaj brenda u Novoj objavi (D-165): utisak, osoba i rad samo iz unetih podataka, u formatu koji
 * ih nosi. Pre i posle na „AI bira” postaje karusel; ostale vrste sa podacima na „AI bira” postaju
 * dizajnirana objava ili tekst, nikad video ili link sa tuđim snimcima.
 */
function composeKind(
  brand: Awaited<ReturnType<typeof getBrand>>,
  input: ComposeInput,
  allowed: PostFormat[],
): { target: KindTarget | null; format: ComposeInput['format'] } {
  if (!input.content) return { target: null, format: input.format }
  const target = findTarget(storedContent(brand.settings), input.content.kind, input.content.ref ?? null)
  if (!target) throw new ApiError('VALIDATION', KIND_GONE)
  if (!isDataKind(target.kind)) return { target, format: input.format }
  const fits = KIND_FORMATS[target.kind].filter((f) => allowed.includes(f))
  if (input.format === 'auto') {
    if (target.kind === 'before_after' && fits.includes('carousel')) return { target, format: 'carousel' }
    if (fits.length) return { target, format: input.format }
    throw new ApiError('VALIDATION', KIND_FORMAT)
  }
  if (input.format === 'poll' || !fits.includes(input.format)) throw new ApiError('VALIDATION', KIND_FORMAT)
  return { target, format: input.format }
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
  // sadržaj brenda (D-165): stavka mora postojati i ići uz izabrani format
  const kind = composeKind(brand, input, allowed)
  const target = kind.target
  const dataKind = Boolean(target && isDataKind(target.kind))
  // anketa (D-151) ide svojim putem: tekst i pitanje sa odgovorima, bez slike
  if (kind.format === 'poll') return composePoll(viewer, brand, { ...input, format: 'poll' }, meta)
  if (!allowed.length)
    throw new ApiError(
      'VALIDATION',
      'Izabrane mreže nemaju zajedničku vrstu objave. Napravite posebne objave.',
    )
  if (kind.format !== 'auto' && !allowed.includes(kind.format))
    throw new ApiError(
      'VALIDATION',
      'Ova vrsta objave ne ide na sve izabrane mreže. Promenite vrstu ili mreže.',
    )
  const request: ComposeInput = { ...input, format: kind.format }

  // karusel, objava i priča dobijaju slajdove u stilu brenda (D-108), osim kad korisnik da svoj medij;
  // utisak, osoba i rad (D-165) uvek, jer gola fotografija bi došla sa Unsplash-a ili Pexels-a
  const dFormat =
    (input.design || dataKind) && !input.mediaAssetIds?.length
      ? designedFormatFor(request.format, allowed)
      : null
  if (dFormat) return composeDesigned(viewer, brand, request, dFormat, meta, target)
  // bez slajdova vrsta sa podacima ide kao tekst ili sa medijem koji je korisnik sam dao
  if (dataKind && !input.mediaAssetIds?.length && request.format !== 'text') {
    if (request.format !== 'auto' || !allowed.includes('text')) throw new ApiError('VALIDATION', KIND_FORMAT)
    request.format = 'text'
  }

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
      format: request.format === 'poll' ? 'text' : request.format,
      kindLines: target ? kindCopyLines(target, 'text') : undefined,
    },
    meta,
  )
  let tokens = text.tokensCharged
  const chosen = text.output.format && allowed.includes(text.output.format) ? text.output.format : null
  const format: PostFormat =
    request.format === 'auto' || request.format === 'poll'
      ? (chosen ?? (allowed.includes('image') ? 'image' : allowed[0]!))
      : request.format
  const query = (text.output.visual_query?.trim() || input.topic).slice(0, 100)
  const first = text.output.variants[0]!
  // utisak klijenta (D-165) ide na početak tačno kako je napisan; X dobija početak utiska i ime
  const review = target?.kind === 'review' ? target.item : null
  const contentLocale = input.locale ?? toContentLocale(brand.content_locale)
  const textOf = (v: typeof first): string => {
    const body = variantToText(v).text
    if (!review) return body
    return v.platform === 'x'
      ? reviewShortQuote(review, contentLocale)
      : `${reviewQuoteBlock(review, contentLocale)}\n\n${body}`
  }

  // vizual po vrsti i izvoru; kad izvor nema rezultat, prelazi se na sledeći uz napomenu
  const need = mediaNeed(format)
  // tema za proveru fotografija i snimaka (D-167): moraju da prikazuju ono o čemu je objava
  const ctx = {
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    uploadedBy: viewer.user.id,
    topic: [input.topic, first.hook].filter(Boolean).join(' '),
  }
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
    const fromPexels = async (count: number) =>
      (await pickPexelsPhotos({ ...ctx, query, count, crop })).map((p) => ({
        asset: p.asset,
        attribution: p.attribution.text,
      }))
    if (input.source === 'template') {
      // pozadina šablona sa Pexels-a: Unsplash fotografiju Sova ne bira sama (D-190)
      let photo: Picked | null = null
      try {
        photo = (await fromPexels(1))[0] ?? null
      } catch (error) {
        logger.warn('compose_template_photo_failed', { brandId: brand.id, error })
      }
      const visual = await generateTemplateVisual(brand, {
        headline: first.hook.slice(0, 80) || input.topic.slice(0, 80),
        subtext: null,
        cta: first.cta ? first.cta.slice(0, 40) : null,
        postId: null,
        runId: null,
        userId: viewer.user.id,
        aspectRatio: format === 'story' ? '9:16' : '1:1',
        photoAssetId: photo?.asset.id ?? null,
      })
      if (visual) {
        tokens += visual.tokens
        const asset = await getAsset(viewer, visual.assetId)
        media = [{ asset, attribution: photo?.attribution ?? null }]
      } else notes.push('Vizual iz šablona nije napravljen.')
    } else if (input.source === 'unsplash') {
      // Unsplash API je za izbor korisnika, ne za automatski izbor (D-190)
      notes.push(
        'Fotografiju sa Unsplash-a birate sami: AI Studio → Unsplash fotografije, pa je dodajte u objavu u editoru.',
      )
    } else {
      // „auto” i Pexels: fotografije sa Pexels-a (D-190: bez automatskog izbora sa Unsplash-a)
      media = await fromPexels(need.count)
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
      text: textOf(v),
      ...(targetFormat === 'story' ? { options: { format: 'story' } } : {}),
    }
  })
  const link = format === 'link' ? (input.linkUrl ?? brand.website_url ?? undefined) : undefined
  if (format === 'link' && !link) notes.push('Link nije unet, a brend nema sajt: dodajte link u objavi.')

  const post = await createPost(viewer, {
    brandId: brand.id,
    title: first.hook.trim().slice(0, 200) || undefined,
    masterText: textOf(first),
    firstComment: first.first_comment?.trim() ? first.first_comment.trim().slice(0, 2200) : undefined,
    linkUrl: link,
    language: input.locale ?? toContentLocale(brand.content_locale),
    targets,
    media: media.map((m, i) => ({ mediaAssetId: m.asset.id, sortOrder: i })),
    source: 'ai',
  })
  const credits = await creditsFor(media.map((m) => m.asset))

  return {
    postId: post.id,
    format,
    locale: input.locale ?? brand.content_locale,
    variants: text.output.variants.map((v) => ({
      platform: v.platform,
      text: textOf(v),
      firstComment: v.first_comment,
    })),
    media: await Promise.all(
      media.map(async (m) => ({
        id: m.asset.id,
        kind: m.asset.kind,
        url: await previewUrl(m.asset),
        attribution: m.attribution,
        credit: credits.get(m.asset.id) ?? null,
      })),
    ),
    targets: targets.length,
    notes,
    tokensCharged: tokens,
  }
}

/**
 * Anketa za LinkedIn i X (D-151): Gemini piše uvod po mreži i pitanje sa 2 do 4 odgovora; anketa ide u
 * `options.poll` svakog targeta, bez slike (obe mreže ne dozvoljavaju anketu i medij zajedno).
 */
async function composePoll(
  viewer: Viewer,
  brand: Awaited<ReturnType<typeof getBrand>>,
  input: ComposeInput & { format: 'poll' },
  meta: { requestId: string; idempotencyKey?: string | null },
): Promise<ComposeResult> {
  const platforms = input.platforms as SocialPlatform[]
  if (!platforms.every(isPollPlatform))
    throw new ApiError('VALIDATION', 'Anketa ide samo na LinkedIn i X. Izaberite samo te mreže.')
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
      format: 'text',
      poll: true,
    },
    meta,
  )
  const poll = normalizePoll(text.output.poll)
  if (!poll) notes.push('Anketa nije napisana: dodajte pitanje i odgovore u objavi.')
  const first = text.output.variants[0]!
  const { accounts } = await listSocialAccounts(viewer, brand.id)
  const active = accounts.filter(
    (a) => a.status === 'active' && (platforms as readonly string[]).includes(a.platform),
  )
  if (!active.length)
    notes.push('Nema povezanih naloga za izabrane mreže: nacrt je bez naloga, dodajte ih u objavi.')
  const byPlatform = new Map(text.output.variants.map((v) => [v.platform, v]))
  const targets = active.map((a) => ({
    socialAccountId: a.id,
    text: variantToText(byPlatform.get(a.platform as SocialPlatform) ?? first).text,
    ...(poll ? { options: { poll } } : {}),
  }))
  const post = await createPost(viewer, {
    brandId: brand.id,
    title: (poll?.question ?? first.hook).trim().slice(0, 200) || undefined,
    masterText: variantToText(first).text,
    language: input.locale ?? toContentLocale(brand.content_locale),
    targets,
    media: [],
    source: 'ai',
  })
  return {
    postId: post.id,
    format: 'text',
    locale: input.locale ?? brand.content_locale,
    variants: text.output.variants.map((v) => ({
      platform: v.platform,
      text: variantToText(v).text,
      firstComment: v.first_comment,
    })),
    media: [],
    targets: targets.length,
    notes,
    tokensCharged: text.tokensCharged,
    ...(poll ? { poll } : {}),
  }
}
