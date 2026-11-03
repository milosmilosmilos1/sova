import 'server-only'

import { z } from 'zod'

import { toContentLocale, type ContentLocale } from '@/config/locales'
import { BANNER_KINDS, BANNER_TEXT_LIMITS, PROFILE_BANNERS, type BannerKind } from '@/config/profile-banners'
import { AiError, toApiError } from '@/lib/ai/errors'
import { generateText } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback, costFor } from '@/lib/ai/orchestrator'
import {
  buildProfileBiosPrompt,
  buildProfileBiosSystemPrompt,
  clipText,
  normalizeProfileBios,
  profileBiosJsonSchema,
  profileBiosOutputSchema,
  type ProfileBios,
} from '@/lib/ai/prompts/profile-bios'
import {
  buildExtrasPrompt,
  buildExtrasSystemPrompt,
  extrasJsonSchema,
  extrasOutputSchema,
  extrasUsable,
  normalizeExtras,
  type ProfileExtras,
} from '@/lib/ai/prompts/profile-extras'
import {
  buildHighlightsPrompt,
  buildHighlightsSystemPrompt,
  highlightsJsonSchema,
  highlightsOutputSchema,
  normalizeHighlights,
  type Highlight,
} from '@/lib/ai/prompts/profile-highlights'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { toBrandContext } from '@/lib/brand/compose'
import { brandProfileSchema, type BrandProfile } from '@/lib/brand/profile-schema'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { getTokenPrice, type TokenAction } from '@/lib/tokens/prices'
import { confirmReservation } from '@/lib/tokens/reservation'
import type { Slide } from '@/lib/visuals/design/types'
import { renderHighlightCover } from '@/lib/visuals/highlight-cover'
import { renderProfileBanner } from '@/lib/visuals/profile-banners'
import { zipStore } from '@/lib/zip'
import { assertDailyQuota, failGeneration, startGeneration } from '@/services/ai/generations'
import { getCurrentProfileRow } from '@/services/brand-brain/profile'
import { getBrand, type BrandRow } from '@/services/brands'
import { brandLogo, resolveDesign, type ResolvedDesign } from '@/services/design/brand-design'
import { themeOf, type PostDesignContext } from '@/services/design/post-design'
import { renderDesignSlides } from '@/services/design/render-post'
import { createPost } from '@/services/posts/posts'
import { systemSubmitForReview } from '@/services/posts/system'
import { listSocialAccounts } from '@/services/social/accounts'
import type { Json } from '@/types/database'

/**
 * Profili na mrežama: opisi profila za svih osam mreža (D-143) i Instagram highlights (D-144), svaki
 * jednim Gemini pozivom iz profila brenda. Rezultat se čuva u `brands.settings.profileKit`, pa ostaje
 * dok se ne napravi nov; naslovne highlights-a, priče od njihovih kadrova i naslovne slike profila
 * (D-145) crtaju se bez tokena.
 */
const storedKitSchema = z.object({
  bios: profileBiosOutputSchema.optional(),
  biosAt: z.string().optional(),
  highlights: highlightsOutputSchema.shape.highlights.optional(),
  highlightsAt: z.string().optional(),
  extras: extrasOutputSchema.optional(),
  extrasAt: z.string().optional(),
})
type StoredKit = z.infer<typeof storedKitSchema>

export interface ProfileKitView {
  website: string | null
  bios: ProfileBios | null
  biosAt: string | null
  highlights: Highlight[] | null
  highlightsAt: string | null
  extras: ProfileExtras | null
  extrasAt: string | null
  prices: { bios: number; highlights: number; extras: number }
  /** brend ima profil (analiza sajta ili ručno popunjen Brain), bez njega opisi nemaju iz čega */
  hasProfile: boolean
  /** brend ima povezan Instagram, pa priča iz highlights-a dobija nalog */
  hasInstagram: boolean
  /** podrazumevani tekst naslovnih slika profila i da li brend ima logo (D-145) */
  banners: BannerText & { hasLogo: boolean }
  /** menja se sa bojama, fontovima i logoom brenda, da pregled naslovnih ne ostane star */
  designKey: string
  canEdit: boolean
}

export interface BannerText {
  title: string
  subtitle: string
  /** sajt ili nalog */
  footer: string
}

function storedKit(settings: unknown): StoredKit {
  const raw = (settings as { profileKit?: unknown } | null)?.profileKit
  const parsed = storedKitSchema.safeParse(raw ?? {})
  return parsed.success ? parsed.data : {}
}

export async function getProfileKit(viewer: Viewer, brandId: string): Promise<ProfileKitView> {
  const brand = await getBrand(viewer, brandId)
  const membership = await requireMembership(viewer, brand.workspace_id)
  const [row, bios, highlights, extras, accounts] = await Promise.all([
    getCurrentProfileRow(brand.id),
    getTokenPrice('profile_bios'),
    getTokenPrice('profile_highlights'),
    getTokenPrice('profile_extras'),
    listSocialAccounts(viewer, brand.id),
  ])
  const kit = storedKit(brand.settings)
  const design = await resolveDesign(brand)
  const profile = row ? brandProfileSchema.safeParse(row.data) : null
  const banners = await bannerDefaults(brand, design, profile?.success ? profile.data : null, kit)
  return {
    website: brand.website_url,
    bios: kit.bios ?? null,
    biosAt: kit.biosAt ?? null,
    highlights: kit.highlights ?? null,
    highlightsAt: kit.highlightsAt ?? null,
    extras: kit.extras ?? null,
    extrasAt: kit.extrasAt ?? null,
    prices: { bios, highlights, extras },
    hasProfile: Boolean(profile?.success),
    hasInstagram: accounts.accounts.some((a) => a.platform === 'instagram' && a.status === 'active'),
    banners: { ...banners, hasLogo: Boolean(design.logoAssetId) },
    designKey: [
      design.colors.primary,
      design.fonts.headings,
      design.fonts.body,
      design.logoAssetId ?? '',
    ].join('|'),
    canEdit: EDIT_ROLES.includes(membership.role),
  }
}

function profileLines(p: BrandProfile, lockedFields: readonly string[], contact: boolean): string[] {
  const c = toBrandContext(p, lockedFields)
  const city = [p.identity.location.value.city, p.identity.location.value.country].filter(Boolean).join(', ')
  return [
    c.description ? `Opis: ${c.description}` : null,
    p.identity.tagline.value ? `Slogan sa sajta: ${p.identity.tagline.value}` : null,
    p.identity.industry.value ? `Delatnost: ${p.identity.industry.value}` : null,
    city ? `Mesto: ${city}` : null,
    c.services.length ? `Usluge i proizvodi: ${c.services.slice(0, 15).join(', ')}` : null,
    c.audience ? `Publika: ${c.audience}` : null,
    c.tone ? `Ton: ${c.tone}` : null,
    c.keyTerms.length ? `Ključni pojmovi: ${c.keyTerms.slice(0, 12).join(', ')}` : null,
    c.facts.length ? `Činjenice: ${c.facts.slice(0, 10).join('; ')}` : null,
    ...(contact
      ? [
          p.offer.price_hints.value.length ? `Cene sa sajta: ${p.offer.price_hints.value.join('; ')}` : null,
          p.contact.phone.value ? `Telefon: ${p.contact.phone.value}` : null,
          p.contact.email.value ? `Email: ${p.contact.email.value}` : null,
          p.contact.address.value ? `Adresa: ${p.contact.address.value}` : null,
          p.contact.working_hours.value ? `Radno vreme: ${p.contact.working_hours.value}` : null,
        ]
      : []),
  ].filter((l): l is string => Boolean(l))
}

interface PromptContext {
  brandName: string
  locale: ContentLocale
  website: string | null
  emoji: boolean
  address: 'vi' | 'ti'
  profile: string[]
}

interface KitSpec<T> {
  action: TokenAction
  label: string
  /** greška kad brend nema profil; tekst je ovde ceo, da ga provera prevoda vidi */
  noProfile: () => ApiError
  contact: boolean
  system: string
  prompt: (ctx: PromptContext) => string
  jsonSchema: Record<string, unknown>
  maxOutputTokens: number
  /** zod provera i sređivanje; null kad odgovor nije upotrebljiv */
  parse: (json: unknown, ctx: PromptContext) => T | null
  save: (kit: StoredKit, value: T, at: string) => StoredKit
}

/** Zajednički tok: rezervacija tokena, Gemini, provera, čuvanje uz brend, potvrda; neuspeh vraća tokene. */
async function generateKit<T>(
  viewer: Viewer,
  brandId: string,
  meta: { requestId: string; idempotencyKey?: string | null },
  spec: KitSpec<T>,
): Promise<{ kit: ProfileKitView; tokensCharged: number }> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  const row = await getCurrentProfileRow(brand.id)
  const parsedProfile = row ? brandProfileSchema.safeParse(row.data) : null
  if (!row || !parsedProfile?.success) throw spec.noProfile()
  const lockedFields = row.locked_fields ?? []
  const context = toBrandContext(parsedProfile.data, lockedFields)
  const ctx: PromptContext = {
    brandName: context.name || brand.name,
    locale: toContentLocale(brand.content_locale),
    website: brand.website_url,
    emoji: context.emoji,
    address: context.address,
    profile: profileLines(parsedProfile.data, lockedFields, spec.contact),
  }
  await assertDailyQuota(brand.workspace_id)
  const price = await getTokenPrice(spec.action)
  const { generationId, reservationId } = await startGeneration({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    userId: viewer.user.id,
    type: 'text',
    tokens: price,
    input: { profileKit: spec.action, website: Boolean(brand.website_url) },
    requestId: meta.requestId,
    idempotencyKey: meta.idempotencyKey ?? null,
  })
  try {
    const outcome = await callWithFallback(
      await textModelChain(),
      (model) =>
        generateText({
          model,
          system: spec.system,
          prompt: spec.prompt(ctx),
          jsonSchema: spec.jsonSchema,
          maxOutputTokens: spec.maxOutputTokens,
          temperature: 0.6,
          thinking: 'low',
          // Netlify seče zahtev na 30 s
          timeoutMs: 25_000,
        }),
      { label: spec.label },
    )
    const value = spec.parse(outcome.result.json, ctx)
    if (value === null) {
      throw new AiError('INVALID_RESPONSE', 'Model je vratio JSON koji ne odgovara šemi.', {
        model: outcome.model,
      })
    }
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
        output: value as unknown as NonNullable<Json>,
        duration_ms: outcome.result.durationMs,
        provider_input_tokens: outcome.result.usage.inputTokens,
        provider_output_tokens: outcome.result.usage.outputTokens + outcome.result.usage.thoughtTokens,
        cost_usd: cost,
      })
      .eq('id', generationId)
    // ostali ključevi podešavanja (Autopilot i drugo) ostaju kakvi jesu
    const { data: fresh } = await admin.from('brands').select('settings').eq('id', brand.id).single()
    const settings = (fresh?.settings as Record<string, Json> | null) ?? {}
    const kit = spec.save(storedKit(settings), value, new Date().toISOString())
    const { error } = await admin
      .from('brands')
      .update({ settings: { ...settings, profileKit: kit as unknown as Json } })
      .eq('id', brand.id)
    if (error) throw mapDbError(error)
    if (reservationId) await confirmReservation(reservationId)
    else
      await admin
        .from('ai_generations')
        .update({ status: 'succeeded', finished_at: new Date().toISOString() })
        .eq('id', generationId)
    return { kit: await getProfileKit(viewer, brand.id), tokensCharged: price }
  } catch (error) {
    const api = toApiError(error)
    await failGeneration(generationId, reservationId, api.code, api.message)
    throw api
  }
}

/** „Napravi opise”: jedan Gemini poziv za svih osam mreža (D-143). */
export function generateProfileBios(
  viewer: Viewer,
  brandId: string,
  meta: { requestId: string; idempotencyKey?: string | null },
) {
  return generateKit<ProfileBios>(viewer, brandId, meta, {
    action: 'profile_bios',
    label: 'profile-bios',
    noProfile: () =>
      new ApiError(
        'VALIDATION',
        'Za opise profila treba profil brenda: analizirajte sajt ili popunite stranu Brain.',
      ),
    contact: false,
    system: buildProfileBiosSystemPrompt(),
    prompt: buildProfileBiosPrompt,
    jsonSchema: profileBiosJsonSchema(),
    maxOutputTokens: 4096,
    parse: (json, ctx) => {
      const parsed = profileBiosOutputSchema.safeParse(json)
      return parsed.success ? normalizeProfileBios(parsed.data, ctx.website) : null
    },
    save: (kit, bios, at) => ({ ...kit, bios, biosAt: at }),
  })
}

/** „Napravi highlights”: naslovi, ikonice i kadrovi priča za Instagram (D-144). */
export function generateHighlights(
  viewer: Viewer,
  brandId: string,
  meta: { requestId: string; idempotencyKey?: string | null },
) {
  return generateKit<Highlight[]>(viewer, brandId, meta, {
    action: 'profile_highlights',
    label: 'profile-highlights',
    noProfile: () =>
      new ApiError(
        'VALIDATION',
        'Za highlights treba profil brenda: analizirajte sajt ili popunite stranu Brain.',
      ),
    contact: true,
    system: buildHighlightsSystemPrompt(),
    prompt: buildHighlightsPrompt,
    jsonSchema: highlightsJsonSchema(),
    maxOutputTokens: 6144,
    parse: (json) => {
      const parsed = highlightsOutputSchema.safeParse(json)
      if (!parsed.success) return null
      const highlights = normalizeHighlights(parsed.data)
      return highlights.length ? highlights : null
    },
    save: (kit, highlights, at) => ({ ...kit, highlights, highlightsAt: at }),
  })
}

async function highlightOf(
  viewer: Viewer,
  brandId: string,
  index: number,
  roles?: typeof EDIT_ROLES,
): Promise<{ brand: BrandRow; highlight: Highlight }> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, roles)
  const highlight = storedKit(brand.settings).highlights?.[index]
  if (!highlight) throw new ApiError('NOT_FOUND', 'Highlight nije pronađen.')
  return { brand, highlight }
}

/** Ime fajla bez dijakritika i razmaka. */
function fileSlug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'dj')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'highlight'
  )
}

/** Naslovna highlights-a u boji teme brenda (PNG 1080×1920). */
export async function highlightCover(
  viewer: Viewer,
  brandId: string,
  index: number,
): Promise<{ png: Buffer; name: string }> {
  const { brand, highlight } = await highlightOf(viewer, brandId, index)
  const design = await resolveDesign(brand)
  const png = await renderHighlightCover({ icon: highlight.icon, primary: design.colors.primary })
  return { png, name: `${index + 1}-${fileSlug(highlight.title)}.png` }
}

/** Sve naslovne u jednom ZIP-u, redom kao na profilu. */
export async function highlightCoversZip(
  viewer: Viewer,
  brandId: string,
): Promise<{ bytes: Buffer; name: string }> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id)
  const highlights = storedKit(brand.settings).highlights ?? []
  if (!highlights.length) throw new ApiError('NOT_FOUND', 'Highlight nije pronađen.')
  const design = await resolveDesign(brand)
  const files = await Promise.all(
    highlights.map(async (h, i) => ({
      name: `${i + 1}-${fileSlug(h.title)}.png`,
      data: await renderHighlightCover({ icon: h.icon, primary: design.colors.primary }),
    })),
  )
  return { bytes: zipStore(files), name: `${fileSlug(brand.name)}-highlights.zip` }
}

/**
 * Priča od kadrova highlights-a: slajdovi u temi brenda, cilj Instagram priča, objava ide u Odobravanje;
 * bez povezanog Instagrama ostaje nacrt. Instagram ne dozvoljava da Sova sama doda priču u highlight,
 * pa je korisnik dodaje na profilu.
 */
export async function createHighlightStory(
  viewer: Viewer,
  brandId: string,
  index: number,
): Promise<{ postId: string; status: 'in_review' | 'draft'; notes: string[] }> {
  const { brand, highlight } = await highlightOf(viewer, brandId, index, EDIT_ROLES)
  const design = await resolveDesign(brand)
  const slides: Slide[] = highlight.frames.map((f, i, all) => ({
    kind: i === 0 ? 'cover' : i === all.length - 1 ? 'cta' : 'point',
    title: f.title,
    body: f.body || null,
  }))
  const rendered = await renderDesignSlides({
    workspaceId: brand.workspace_id,
    brandId: brand.id,
    design,
    styleId: design.styleId,
    format: 'story',
    slides,
    photoSource: design.photoSource,
    query: (highlight.visual_query || highlight.title).slice(0, 100),
    uploadedBy: viewer.user.id,
    variant: 0,
    origin: { highlight: highlight.title },
  })
  const notes = [...rendered.notes]
  const { accounts } = await listSocialAccounts(viewer, brand.id)
  const instagram = accounts.filter((a) => a.status === 'active' && a.platform === 'instagram')
  if (!instagram.length)
    notes.push('Nema povezanog Instagram naloga: nacrt je bez naloga, dodajte ga u objavi.')
  const text = highlight.frames.map((f) => [f.title, f.body].filter(Boolean).join('\n')).join('\n\n')
  const locale = toContentLocale(brand.content_locale)
  const post = await createPost(viewer, {
    brandId: brand.id,
    title: `Highlight: ${highlight.title}`,
    masterText: text.slice(0, 2200),
    language: locale,
    targets: instagram.map((a) => ({ socialAccountId: a.id, options: { format: 'story' } })),
    media: rendered.assetIds.map((mediaAssetId, sortOrder) => ({ mediaAssetId, sortOrder })),
    source: 'ai',
  })
  const designContext: PostDesignContext = {
    topic: highlight.title,
    cta: null,
    format: 'story',
    styleId: design.styleId,
    slides: slides.length,
    photoSource: design.photoSource,
    size: design.size,
    ...themeOf(design),
    variant: 0,
    locale,
    platforms: ['instagram'],
    copy: { slides, photoAssetIds: rendered.photoIds },
  }
  await createSupabaseAdminClient()
    .from('posts')
    .update({ design: designContext as unknown as Json })
    .eq('id', post.id)
  if (!instagram.length) return { postId: post.id, status: 'draft', notes }
  await systemSubmitForReview(post.id, `highlight: ${highlight.title}`, { notify: false })
  return { postId: post.id, status: 'in_review', notes }
}

// dodaci za profile po mreži (D-146) ------------------------------------------------------------

/** „Napravi dodatke”: Pinterest table, YouTube, Google usluge, pitanja i prikačene objave, jednim pozivom. */
export function generateProfileExtras(
  viewer: Viewer,
  brandId: string,
  meta: { requestId: string; idempotencyKey?: string | null },
) {
  return generateKit<ProfileExtras>(viewer, brandId, meta, {
    action: 'profile_extras',
    label: 'profile-extras',
    noProfile: () =>
      new ApiError(
        'VALIDATION',
        'Za dodatke za profile treba profil brenda: analizirajte sajt ili popunite stranu Brain.',
      ),
    contact: true,
    system: buildExtrasSystemPrompt(),
    prompt: buildExtrasPrompt,
    jsonSchema: extrasJsonSchema(),
    maxOutputTokens: 6144,
    parse: (json) => {
      const parsed = extrasOutputSchema.safeParse(json)
      if (!parsed.success) return null
      const extras = normalizeExtras(parsed.data)
      return extrasUsable(extras) ? extras : null
    },
    save: (kit, extras, at) => ({ ...kit, extras, extrasAt: at }),
  })
}

/** Nacrt od objave za vrh profila: tekst je gotov, mreže korisnik bira u objavi. */
export async function createPinnedDraft(
  viewer: Viewer,
  brandId: string,
  index: number,
): Promise<{ postId: string }> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const pinned = storedKit(brand.settings).extras?.pinned_posts[index]
  if (!pinned) throw new ApiError('NOT_FOUND', 'Objava za vrh profila nije pronađena.')
  const post = await createPost(viewer, {
    brandId: brand.id,
    title: pinned.title,
    masterText: pinned.text,
    language: toContentLocale(brand.content_locale),
    targets: [],
    media: [],
    source: 'ai',
  })
  return { postId: post.id }
}

// naslovne slike profila (D-145) ----------------------------------------------------------------

/** Sajt bez protokola i „www.”, kako se piše na slici. */
const siteLabel = (url: string) =>
  url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')

/** Odnos širine i visine logoa iz zapisa fajla, bez preuzimanja slike. */
async function logoAspect(assetId: string): Promise<number> {
  const { data } = await createSupabaseAdminClient()
    .from('media_assets')
    .select('width, height')
    .eq('id', assetId)
    .maybeSingle()
  return data?.width && data.height ? data.width / data.height : 1
}

/**
 * Podrazumevani tekst naslovnih: ime brenda (izostaje kad je logo natpis, jer ime već piše na njemu),
 * slogan sa sajta, slogan iz opisa za LinkedIn ili prva rečenica opisa, pa sajt ili nalog.
 */
async function bannerDefaults(
  brand: BrandRow,
  design: ResolvedDesign,
  profile: BrandProfile | null,
  kit: StoredKit,
): Promise<BannerText> {
  const wordmark = design.logoAssetId ? (await logoAspect(design.logoAssetId)) >= 2.2 : false
  const description = profile?.identity.description.value ?? ''
  const subtitle =
    profile?.identity.tagline.value || kit.bios?.linkedin.short || description.split(/(?<=[.!?])\s+/)[0] || ''
  return {
    title: wordmark ? '' : clipText(design.brandName, BANNER_TEXT_LIMITS.title),
    subtitle: clipText(subtitle.replace(/\s+/g, ' ').trim(), BANNER_TEXT_LIMITS.subtitle),
    footer: clipText(
      brand.website_url ? siteLabel(brand.website_url) : (design.handle ?? ''),
      BANNER_TEXT_LIMITS.footer,
    ),
  }
}

export interface BannerOptions extends Partial<BannerText> {
  /** false: naslovna bez logoa i kad ga brend ima */
  logo?: boolean
  /** manja slika za pregled na ekranu */
  preview?: boolean
}

/** Tekst iz upita; polje koje nije poslato dobija podrazumevanu vrednost, a prazno ostaje prazno. */
export function bannerOptionsFrom(query: {
  title?: string
  subtitle?: string
  footer?: string
  logo?: '0' | '1'
  preview?: '1'
}): BannerOptions {
  return {
    title: query.title,
    subtitle: query.subtitle,
    footer: query.footer,
    logo: query.logo !== '0',
    preview: query.preview === '1',
  }
}

const PREVIEW_WIDTH = 960

async function bannerInputs(brand: BrandRow, options: BannerOptions) {
  const design = await resolveDesign(brand)
  const missing =
    options.title === undefined || options.subtitle === undefined || options.footer === undefined
  const [logo, defaults] = await Promise.all([
    options.logo === false ? null : brandLogo(design.logoAssetId),
    missing
      ? getCurrentProfileRow(brand.id).then((row) => {
          const parsed = row ? brandProfileSchema.safeParse(row.data) : null
          return bannerDefaults(
            brand,
            design,
            parsed?.success ? parsed.data : null,
            storedKit(brand.settings),
          )
        })
      : null,
  ])
  return {
    brandName: design.brandName,
    colors: design.colors,
    fonts: design.fonts,
    logo,
    title: options.title ?? defaults?.title ?? '',
    subtitle: options.subtitle ?? defaults?.subtitle ?? '',
    footer: options.footer ?? defaults?.footer ?? '',
  }
}

function bannerFile(brand: BrandRow, kind: BannerKind): string {
  const { width, height } = PROFILE_BANNERS[kind]
  return `${fileSlug(brand.name)}-${kind.replace('_', '-')}-${width}x${height}.png`
}

/** Naslovna slika profila za jednu mrežu, u bojama, fontu i logou brenda; bez tokena. */
export async function profileBanner(
  viewer: Viewer,
  brandId: string,
  kind: BannerKind,
  options: BannerOptions,
): Promise<{ png: Buffer; name: string }> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id)
  const input = await bannerInputs(brand, options)
  const png = await renderProfileBanner({ kind, ...input }, options.preview ? PREVIEW_WIDTH : undefined)
  return { png, name: bannerFile(brand, kind) }
}

/** Profilna i sve naslovne u jednom ZIP-u, u punoj veličini; crtaju se redom, da ne zauzmu memoriju odjednom. */
export async function profileBannersZip(
  viewer: Viewer,
  brandId: string,
  options: BannerOptions,
): Promise<{ bytes: Buffer; name: string }> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id)
  const input = await bannerInputs(brand, options)
  const files: Array<{ name: string; data: Buffer }> = []
  for (const kind of BANNER_KINDS)
    files.push({ name: bannerFile(brand, kind), data: await renderProfileBanner({ kind, ...input }) })
  return { bytes: zipStore(files), name: `${fileSlug(brand.name)}-profile-covers.zip` }
}
