import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { brandProfileSchema } from '@/lib/brand/profile-schema'
import { logger } from '@/lib/logger'
import { storedDesignSchema, type StoredDesign, type UpdateDesignInput } from '@/lib/schemas/design'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import {
  DEFAULT_STYLE,
  SLIDES_DEFAULT,
  type PhotoSource,
  type PostSize,
  type StyleId,
} from '@/lib/visuals/design/catalog'
import { contrast, mix, readable } from '@/lib/visuals/design/kit'
import type { LookId } from '@/lib/visuals/design/looks'
import type { DesignColors } from '@/lib/visuals/design/types'
import { prepareLogoForTemplate } from '@/lib/visuals/render'
import { getCurrentProfileRow } from '@/services/brand-brain/profile'
import { getBrand, type BrandRow } from '@/services/brands'
import { downloadAsset, getAsset } from '@/services/media'
import type { Json } from '@/types/database'

/**
 * Dizajn brenda (D-108): stil, format, izvor fotografija, broj slajdova, boje i nalog na slajdovima.
 * Čuva se samo ono što je korisnik izabrao (`brands.design`); ostalo dolazi iz profila brenda
 * (paleta i fontovi sa sajta) i sa povezanog Instagram ili Facebook naloga.
 */
export interface ResolvedDesign {
  styleId: StyleId
  size: PostSize
  photoSource: PhotoSource
  slides: number
  colors: DesignColors
  fonts: { headings: string; body: string }
  /** font je izabrao korisnik (D-123), pa važi i u stilovima koji imaju svoj font */
  fontsLocked: boolean
  /** izabrani izgled (D-123); `null` dok korisnik ne izabere */
  look: LookId | null
  handle: string | null
  brandName: string
  logoAssetId: string | null
  /** odakle je logo: sopstveni (D-113) ili sa sajta */
  logoSource: 'custom' | 'site' | null
  /** šta je sačuvano, a šta podrazumevano (UI prikazuje „iz profila brenda”) */
  saved: { colors: boolean; handle: boolean }
}

const FALLBACK_COLORS: DesignColors = {
  primary: '#2563EB',
  secondary: '#0EA5E9',
  background: '#FFFFFF',
  text: '#111827',
  muted: '#6B7280',
}

/** Paleta sa sajta u pet boja dizajna; tekst mora biti čitljiv na pozadini. */
function colorsFromProfile(
  data: unknown,
): { colors: DesignColors; fonts: { headings: string; body: string } } | null {
  const parsed = brandProfileSchema.safeParse(data)
  if (!parsed.success) return null
  const palette = parsed.data.visual.colors.value
  const fonts = parsed.data.visual.fonts.value
  const valid = (hex: string | undefined) => (hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : null)
  const primary = valid(palette.primary) ?? FALLBACK_COLORS.primary
  const secondary = valid(palette.secondary) ?? valid(palette.accent) ?? FALLBACK_COLORS.secondary
  const background = valid(palette.neutral_light) ?? '#FFFFFF'
  const textRaw = valid(palette.neutral_dark) ?? '#111827'
  const text = contrast(background, textRaw) >= 4.5 ? textRaw : readable(background)
  return {
    colors: { primary, secondary, background, text, muted: mix(text, background, 0.4).toUpperCase() },
    fonts: { headings: fonts.mapped_headings || 'Inter', body: fonts.mapped_body || 'Inter' },
  }
}

async function defaultHandle(brandId: string): Promise<string | null> {
  const { data } = await createSupabaseAdminClient()
    .from('social_accounts')
    .select('platform, username, status')
    .eq('brand_id', brandId)
    .in('platform', ['instagram', 'facebook', 'tiktok', 'x'])
    .eq('status', 'active')
  const order = ['instagram', 'tiktok', 'x', 'facebook']
  const best = (data ?? [])
    .filter((a) => a.username)
    .sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform))[0]
  return best?.username ? `@${best.username.replace(/^@/, '')}` : null
}

export function storedDesign(brand: Pick<BrandRow, 'design'>): StoredDesign {
  const parsed = storedDesignSchema.safeParse(brand.design ?? {})
  return parsed.success ? parsed.data : {}
}

export async function resolveDesign(
  brand: Pick<BrandRow, 'id' | 'name' | 'design' | 'logo_asset_id'>,
): Promise<ResolvedDesign> {
  const stored = storedDesign(brand)
  const profile = await getCurrentProfileRow(brand.id)
  const fromProfile = profile ? colorsFromProfile(profile.data) : null
  const profileLogo = (() => {
    const parsed = profile ? brandProfileSchema.safeParse(profile.data) : null
    return parsed?.success ? parsed.data.visual.logo.value.asset_id : null
  })()
  const handle = stored.handle !== undefined ? stored.handle : await defaultHandle(brand.id)
  return {
    styleId: stored.styleId ?? DEFAULT_STYLE,
    size: stored.size ?? 'portrait',
    photoSource: stored.photoSource ?? 'stock',
    slides: stored.slides ?? SLIDES_DEFAULT,
    colors: stored.colors ?? fromProfile?.colors ?? FALLBACK_COLORS,
    fonts: stored.fonts ?? fromProfile?.fonts ?? { headings: 'Inter', body: 'Inter' },
    fontsLocked: Boolean(stored.fonts),
    look: stored.look ?? null,
    handle: handle ? (handle.startsWith('@') ? handle : `@${handle}`) : null,
    brandName: brand.name,
    logoAssetId: stored.logoAssetId ?? profileLogo ?? brand.logo_asset_id ?? null,
    logoSource: stored.logoAssetId ? 'custom' : (profileLogo ?? brand.logo_asset_id) ? 'site' : null,
    saved: { colors: Boolean(stored.colors), handle: stored.handle !== undefined },
  }
}

export async function getDesignView(viewer: Viewer, brandId: string): Promise<ResolvedDesign> {
  const brand = await getBrand(viewer, brandId)
  return resolveDesign(brand)
}

export async function updateDesign(
  viewer: Viewer,
  brandId: string,
  input: UpdateDesignInput,
): Promise<ResolvedDesign> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const stored = storedDesign(brand)
  // poslednja poseta sajtu nije podešavanje, pa ostaje i posle vraćanja na podrazumevano
  const next: StoredDesign = input.reset
    ? stored.siteVisual
      ? { siteVisual: stored.siteVisual }
      : {}
    : { ...stored }
  if (input.styleId !== undefined) next.styleId = input.styleId
  if (input.size !== undefined) next.size = input.size
  if (input.photoSource !== undefined) next.photoSource = input.photoSource
  if (input.slides !== undefined) next.slides = input.slides
  if (input.colors !== undefined) next.colors = input.colors
  if (input.logoAssetId !== undefined) {
    if (input.logoAssetId === null) delete next.logoAssetId
    else {
      // logo mora biti slika iz biblioteke ovog brenda (ili radnog prostora)
      const asset = await getAsset(viewer, input.logoAssetId)
      if (
        asset.kind !== 'image' ||
        asset.workspace_id !== brand.workspace_id ||
        (asset.brand_id !== null && asset.brand_id !== brand.id)
      )
        throw new ApiError('VALIDATION', 'Logo mora biti slika iz biblioteke ovog brenda.')
      next.logoAssetId = asset.id
    }
  }
  if (input.handle !== undefined) {
    const h = input.handle?.replace(/^@/, '').trim()
    if (h) next.handle = `@${h}`
    else delete next.handle
  }
  if (input.fonts !== undefined) {
    if (input.fonts) next.fonts = input.fonts
    else delete next.fonts
  }
  if (input.look !== undefined) {
    if (input.look) next.look = input.look
    else delete next.look
  }
  // upis kroz service role posle provere uloge, kao ostala podešavanja brenda
  const { data, error } = await createSupabaseAdminClient()
    .from('brands')
    .update({ design: next as unknown as Json })
    .eq('id', brandId)
    .select('id, name, design, logo_asset_id')
    .single()
  if (error) throw mapDbError(error)
  return resolveDesign(data)
}

/** Logo brenda kao data URI za slajdove; bez logoa slajd ispisuje ime brenda. */
export async function logoDataUri(logoAssetId: string | null): Promise<string | null> {
  if (!logoAssetId) return null
  const { data: logo } = await createSupabaseAdminClient()
    .from('media_assets')
    .select('*')
    .eq('id', logoAssetId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!logo) return null
  try {
    return await prepareLogoForTemplate(await downloadAsset(logo), logo.mime_type)
  } catch (error) {
    logger.warn('design_logo_failed', { logoAssetId, error })
    return null
  }
}
