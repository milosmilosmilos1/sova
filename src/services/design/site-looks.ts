import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { brandProfileSchema } from '@/lib/brand/profile-schema'
import { getCrawlDeps } from '@/lib/crawler/deps'
import { fetchPage, isFailure } from '@/lib/crawler/fetch-page'
import { readVisual } from '@/lib/crawler/visual'
import { logger } from '@/lib/logger'
import { siteVisualSchema } from '@/lib/schemas/design'
import { normalizeUrl } from '@/lib/ssrf'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { StyleId } from '@/lib/visuals/design/catalog'
import { FONT_NAME, LOOK_FONTS } from '@/lib/visuals/design/font-choices'
import {
  CUSTOM_LOOK_STYLE,
  siteLooks,
  type LookId,
  type LookOption,
  type SiteVisual,
} from '@/lib/visuals/design/looks'
import { getCurrentProfileRow } from '@/services/brand-brain/profile'
import { getBrand, type BrandRow } from '@/services/brands'
import type { Json } from '@/types/database'

import { resolveDesign, storedDesign } from './brand-design'

/**
 * Izbor izgleda (D-123): tri predloga od boja i fontova sa sajta brenda i sopstveni izgled.
 * Sova poseti početnu stranu (CSS, `theme-color`, logo, fontovi) i zapamti šta je našla u
 * `brands.design.siteVisual`; dok sajt nije posećen, predlozi se prave od boja iz analize brenda.
 */
export interface LooksView {
  /** sajt brenda iz podešavanja; bez njega nema posete */
  website: string | null
  /** tri predloga; `null` kad brend nema ni sajt ni boje iz analize */
  site: { url: string; at: string; source: SiteVisual['source']; options: LookOption[] } | null
  /** zašto predlozi nisu sa sajta (sajt se nije otvorio, nema sajta) */
  siteError: string | null
  /** brend ima sajt koji Sova još nije posetila ili je poseta starija od mesec dana */
  visit: boolean
  /** početne vrednosti sopstvenog izgleda: trenutne boje i font brenda i stil u kom se pravi */
  custom: { styleId: StyleId; primary: string; secondary: string; tertiary: string; font: string }
  current: LookId | null
  /** fontovi za izbor: prvo oni sa sajta, pa ponuđeni */
  fonts: string[]
}

const VISIT_TTL_MS = 30 * 24 * 3600 * 1000

/** Boje i fontovi iz analize brenda (profil), kad sajt još nije posećen ili ne može da se otvori. */
async function profileVisual(brand: BrandRow): Promise<SiteVisual | null> {
  const row = await getCurrentProfileRow(brand.id)
  const parsed = row ? brandProfileSchema.safeParse(row.data) : null
  if (!row || !parsed?.success) return null
  const colors = parsed.data.visual.colors.value
  const fonts = parsed.data.visual.fonts.value
  const visual = siteVisualSchema.safeParse({
    url: brand.website_url ?? '',
    at: row.created_at,
    source: 'profile',
    primary: colors.primary,
    secondary: colors.secondary,
    accent: colors.accent,
    light: colors.neutral_light,
    dark: colors.neutral_dark,
    headings: fonts.mapped_headings || 'Inter',
    body: fonts.mapped_body || fonts.mapped_headings || 'Inter',
  })
  return visual.success ? visual.data : null
}

function buildView(
  brand: BrandRow,
  visual: SiteVisual | null,
  siteError: string | null,
  design: Awaited<ReturnType<typeof resolveDesign>>,
): LooksView {
  const stored = storedDesign(brand)
  const fresh =
    stored.siteVisual?.source === 'site' && Date.now() - Date.parse(stored.siteVisual.at) < VISIT_TTL_MS
  const siteFonts = visual ? [visual.headings, visual.body] : []
  const fonts = [...new Set([...siteFonts, ...LOOK_FONTS].filter((f) => FONT_NAME.test(f)))]
  return {
    website: brand.website_url,
    site: visual
      ? { url: visual.url, at: visual.at, source: visual.source, options: siteLooks(visual) }
      : null,
    siteError,
    visit: Boolean(brand.website_url) && !fresh && !siteError,
    custom: {
      // stil u kom se vide sve tri boje; sačuvan sopstveni izgled zadržava stil izabran posle njega
      styleId: stored.look === 'custom' && stored.styleId ? stored.styleId : CUSTOM_LOOK_STYLE,
      primary: design.colors.primary,
      secondary: design.colors.secondary,
      tertiary: design.colors.background,
      font: design.fonts.headings,
    },
    current: design.look,
    fonts,
  }
}

export async function getLooksView(viewer: Viewer, brandId: string): Promise<LooksView> {
  const brand = await getBrand(viewer, brandId)
  const design = await resolveDesign(brand)
  const visual = storedDesign(brand).siteVisual ?? (await profileVisual(brand))
  return buildView(brand, visual, null, design)
}

/** Poseta sajtu sada: boje i fontovi sa početne strane, zapamćeni za sledeći put. */
export async function visitSiteLooks(viewer: Viewer, brandId: string): Promise<LooksView> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!brand.website_url)
    throw new ApiError(
      'VALIDATION',
      'Brend nema sajt. Dodajte ga u podešavanjima brenda ili izaberite svoje boje.',
    )

  let siteError: string | null = null
  let visual: SiteVisual | null = null
  try {
    const deps = getCrawlDeps()
    const page = await fetchPage(normalizeUrl(brand.website_url).toString(), deps, {
      timeoutMs: 12_000,
      maxBytes: 3 * 1024 * 1024,
    })
    if (isFailure(page)) siteError = `Sajt nije mogao da se otvori: ${page.message}`
    else {
      const { palette, fonts } = await readVisual(page, deps)
      const parsed = siteVisualSchema.safeParse({
        url: page.url,
        at: new Date().toISOString(),
        source: 'site',
        primary: palette.primary,
        secondary: palette.secondary,
        accent: palette.accent,
        light: palette.neutralLight,
        dark: palette.neutralDark,
        headings: fonts.mappedHeadings || 'Inter',
        body: fonts.mappedBody || fonts.mappedHeadings || 'Inter',
      })
      if (parsed.success) visual = parsed.data
      else siteError = 'Na sajtu nisu nađene boje i fontovi. Izaberite svoje boje.'
    }
  } catch (error) {
    logger.warn('site_looks_visit_failed', { brandId, error })
    siteError = 'Sajt nije mogao da se otvori. Proverite adresu sajta ili izaberite svoje boje.'
  }

  if (visual) {
    // samo poslednja poseta; izbor korisnika i ostala podešavanja ostaju kakvi jesu
    const { data, error } = await createSupabaseAdminClient()
      .from('brands')
      .update({ design: { ...storedDesign(brand), siteVisual: visual } as unknown as Json })
      .eq('id', brand.id)
      .select('*')
      .single()
    if (error) throw new ApiError('INTERNAL', 'Poseta sajtu nije sačuvana. Pokušajte ponovo.')
    return buildView(data, visual, null, await resolveDesign(data))
  }
  const fallback = storedDesign(brand).siteVisual ?? (await profileVisual(brand))
  return buildView(brand, fallback, siteError, await resolveDesign(brand))
}
