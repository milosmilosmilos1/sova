import 'server-only'

import { contentLocaleForUi } from '@/config/locales'
import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { ApiError } from '@/lib/api/errors'
import { requestMemo, seedRequestMemo } from '@/lib/auth/request-memo'
import type { Viewer } from '@/lib/auth/viewer'
import { ADMIN_ROLES, EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { brandLogoUrl, brandSwatch, ICON_MAX_ASPECT, type BrandSwatch } from '@/lib/brands/swatch'
import { logger } from '@/lib/logger'
import { hexColorSchema } from '@/lib/schemas/design'
import type { CreateBrandInput } from '@/lib/schemas/workspace'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import { getWorkspacePlan } from '@/services/plans'
import type { Database } from '@/types/database'

export type BrandRow = Database['public']['Tables']['brands']['Row']

const BRAND_COLUMNS =
  'id, workspace_id, name, website_url, timezone, content_locale, autopilot_level, status, logo_asset_id, report_emails, created_at, updated_at, setup_completed_at'

export type BrandSummary = Pick<
  BrandRow,
  | 'id'
  | 'workspace_id'
  | 'name'
  | 'website_url'
  | 'timezone'
  | 'content_locale'
  | 'autopilot_level'
  | 'status'
  | 'logo_asset_id'
  | 'report_emails'
  | 'created_at'
  | 'updated_at'
  | 'setup_completed_at'
>

/**
 * Brendovi radnog prostora. Provera članstva i upit idu u isto vreme (D-164): RLS ionako vraća samo
 * brendove kojima korisnik ima pristup, a bez članstva poziv i dalje pada sa 404.
 */
export function listBrands(viewer: Viewer, workspaceId: string): Promise<BrandSummary[]> {
  return requestMemo(viewer, `brands:${workspaceId}`, async () => {
    const [, res] = await Promise.all([
      requireMembership(viewer, workspaceId),
      viewer.supabase
        .from('brands')
        .select(BRAND_COLUMNS)
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
    ])
    return unwrap(res)
  })
}

/**
 * Boja svakog brenda za birač brenda, listu brendova i početnu (D-137): izabrana u Vizuelnom identitetu,
 * inače sa sajta (trenutni profil brenda), inače rezervna. Greška ne obara stranu, jer `brandSwatch` i
 * bez podataka daje boju. Brend sa kvadratnim logoom dobija i ikonicu logoa (D-155), istim redom kao
 * slajdovi: sopstveni logo, logo sa sajta, logo brenda.
 */
export async function listBrandSwatches(
  viewer: Viewer,
  workspaceId: string,
): Promise<Record<string, BrandSwatch>> {
  const rows = await swatchRows(viewer, workspaceId)
  if (!rows) return {}
  const logoOf = new Map(
    rows.map((row) => {
      const custom = z.uuid().safeParse(row.custom_logo).success ? row.custom_logo : null
      return [row.id, custom ?? row.brand_profiles[0]?.site_logo ?? row.logo_asset_id ?? null]
    }),
  )
  const ids = [...new Set([...logoOf.values()].filter((id): id is string => Boolean(id)))]
  // širok natpis na 20 px nije čitljiv: ikonica samo za kvadratan logo (veličina iz biblioteke)
  const square = new Set<string>()
  if (ids.length) {
    const { data: assets } = await viewer.supabase
      .from('media_assets')
      .select('id, width, height')
      .in('id', ids)
    for (const a of assets ?? []) {
      const aspect = a.width && a.height ? a.width / a.height : 1
      if (aspect <= ICON_MAX_ASPECT && aspect >= 1 / ICON_MAX_ASPECT) square.add(a.id)
    }
  }
  return Object.fromEntries(
    rows.map((row) => {
      const chosen = hexColorSchema.safeParse(row.custom_primary)
      const site = row.brand_profiles[0]?.site_primary
      const logo = logoOf.get(row.id)
      return [
        row.id,
        brandSwatch(
          row.id,
          chosen.success ? chosen.data : (site ?? null),
          logo && square.has(logo) ? brandLogoUrl(row.id, logo) : null,
        ),
      ]
    }),
  )
}

/**
 * Polja za boju i ikonicu brenda (D-137, D-155): izbor iz Vizuelnog identiteta, pa trenutni profil sa
 * sajta. Čitaju se samo ta polja iz dizajna, ne ceo dizajn (šabloni iz Figme ga čine velikim).
 */
const SWATCH_FIELDS =
  'custom_primary:design->colors->>primary, custom_logo:design->>logoAssetId, brand_profiles(site_primary:data->visual->colors->value->>primary, site_logo:data->visual->logo->value->>asset_id)'

export interface SwatchRow {
  id: string
  logo_asset_id: string | null
  custom_primary: string | null
  custom_logo: string | null
  brand_profiles: Array<{ site_primary: string | null; site_logo: string | null }>
}

/** Redovi za boje brendova; u čitanjima se pamte po zahtevu, a prvo čitanje strane ih već donese. */
function swatchRows(viewer: Viewer, workspaceId: string): Promise<SwatchRow[] | null> {
  return requestMemo(viewer, `swatchRows:${workspaceId}`, async () => {
    const { data, error } = await viewer.supabase
      .from('brands')
      .select(`id, logo_asset_id, ${SWATCH_FIELDS}`)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .eq('brand_profiles.is_current', true)
    if (error) {
      // boja nije vredna pada strane: brandSwatch i bez podataka daje rezervnu boju
      logger.warn('brand_swatches_failed', { error: error.message })
      return null
    }
    return (data ?? []) as unknown as SwatchRow[]
  })
}

/**
 * Svi dostupni brendovi korisnika sa poljima boje, jednim upitom (app-prefetch, D-164). Bez filtera po
 * radnom prostoru: RLS (has_brand_access) vraća samo brendove kojima korisnik ima pristup, a prostor se
 * bira u memoriji, kao što listBrands radi upitom.
 */
export function brandContextQuery(supabase: Viewer['supabase']) {
  return supabase
    .from('brands')
    .select(`${BRAND_COLUMNS}, ${SWATCH_FIELDS}`)
    .is('deleted_at', null)
    .eq('brand_profiles.is_current', true)
    .order('created_at', { ascending: true })
}

export type BrandContextRow = BrandSummary & Omit<SwatchRow, 'id' | 'logo_asset_id'>

/** Brendovi jednog prostora iz redova prvog čitanja: lista brendova i boje, kao listBrands i swatchRows. */
export function seedWorkspaceBrands(viewer: Viewer, workspaceId: string, rows: BrandContextRow[]): void {
  const mine = rows.filter((row) => row.workspace_id === workspaceId)
  seedRequestMemo(
    viewer,
    `brands:${workspaceId}`,
    mine.map((row): BrandSummary => ({
      id: row.id,
      workspace_id: row.workspace_id,
      name: row.name,
      website_url: row.website_url,
      timezone: row.timezone,
      content_locale: row.content_locale,
      autopilot_level: row.autopilot_level,
      status: row.status,
      logo_asset_id: row.logo_asset_id,
      report_emails: row.report_emails,
      created_at: row.created_at,
      updated_at: row.updated_at,
      setup_completed_at: row.setup_completed_at,
    })),
  )
  seedRequestMemo(
    viewer,
    `swatchRows:${workspaceId}`,
    mine.map((row): SwatchRow => ({
      id: row.id,
      logo_asset_id: row.logo_asset_id,
      custom_primary: row.custom_primary,
      custom_logo: row.custom_logo,
      brand_profiles: row.brand_profiles,
    })),
  )
}

/** Pun red trenutnog brenda iz prvog čitanja (kolačić brenda), da ga strana ne čita ponovo. */
export function seedBrandRow(viewer: Viewer, row: BrandRow): void {
  seedRequestMemo(viewer, `brand:${row.id}`, row)
}

/** Brend po id-ju (RLS: samo dostupni); u čitanjima se pamti po zahtevu (request-memo, D-164). */
export function getBrand(viewer: Viewer, brandId: string): Promise<BrandRow> {
  return requestMemo(viewer, `brand:${brandId}`, async () =>
    unwrap(
      await viewer.supabase.from('brands').select('*').eq('id', brandId).is('deleted_at', null).maybeSingle(),
      'Brend ne postoji ili nemate pristup.',
    ),
  )
}

export async function createBrand(viewer: Viewer, input: CreateBrandInput): Promise<BrandSummary> {
  await requireMembership(viewer, input.workspaceId, EDIT_ROLES)
  const plan = await getWorkspacePlan(input.workspaceId)
  const { count } = await viewer.supabase
    .from('brands')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', input.workspaceId)
    .is('deleted_at', null)
  if ((count ?? 0) >= plan.limits.brands) {
    throw new ApiError(
      'PLAN_LIMIT',
      `Vaš plan dozvoljava ${plan.limits.brands} ${plan.limits.brands === 1 ? 'brend' : 'brenda'}. Nadogradite plan za više brendova.`,
    )
  }
  // Bez RETURNING: pravilo za čitanje brenda (has_brand_access) traži red po id-ju, a u istoj naredbi
  // ga još ne vidi (STABLE funkcija čita stanje sa početka naredbe), pa bi upis pao kao „nemate
  // dozvolu”. Id pravimo ovde i brend čitamo posebnim upitom, posle upisa.
  const id = randomUUID()
  const { error } = await viewer.supabase.from('brands').insert({
    id,
    workspace_id: input.workspaceId,
    name: input.name,
    website_url: input.websiteUrl ?? null,
    timezone: input.timezone,
    content_locale: input.contentLocale ?? contentLocaleForUi(viewer.profile.locale),
    created_by: viewer.user.id,
  })
  if (error) throw mapDbError(error, 'Brend nije sačuvan.')
  return unwrap(
    await viewer.supabase.from('brands').select(BRAND_COLUMNS).eq('id', id).single(),
    'Brend nije sačuvan.',
  )
}

export async function updateBrand(
  viewer: Viewer,
  brandId: string,
  patch: Partial<
    Pick<BrandRow, 'name' | 'website_url' | 'timezone' | 'content_locale' | 'status' | 'report_emails'>
  >,
): Promise<BrandSummary> {
  const brand = await getBrand(viewer, brandId)
  const membership = await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  // izveštaj tada odlazi van tima: adrese menja vlasnik ili administrator (D-094)
  if (patch.report_emails !== undefined && !ADMIN_ROLES.includes(membership.role))
    throw new ApiError('FORBIDDEN', 'Primaoce mesečnog izveštaja menja vlasnik ili administrator.')
  const update: Database['public']['Tables']['brands']['Update'] = {}
  if (patch.name !== undefined) update.name = patch.name
  if (patch.website_url !== undefined) update.website_url = patch.website_url
  if (patch.timezone !== undefined) update.timezone = patch.timezone
  if (patch.content_locale !== undefined) update.content_locale = patch.content_locale
  if (patch.report_emails !== undefined)
    update.report_emails = [...new Set(patch.report_emails.map((e) => e.trim().toLowerCase()))]
  if (patch.status !== undefined) {
    update.status = patch.status
    update.paused_at = patch.status === 'paused' ? new Date().toISOString() : null
    update.paused_by = patch.status === 'paused' ? viewer.user.id : null
  }
  return unwrap(
    await viewer.supabase.from('brands').update(update).eq('id', brandId).select(BRAND_COLUMNS).single(),
  )
}

/** Meko brisanje (arhiva); upis kroz service role posle provere uloge, jer SELECT politika skriva obrisan red (D-081). */
export async function deleteBrand(viewer: Viewer, brandId: string): Promise<void> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, ADMIN_ROLES)
  const { count } = await viewer.supabase
    .from('brands')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', brand.workspace_id)
    .is('deleted_at', null)
  if ((count ?? 0) <= 1) throw new ApiError('CONFLICT', 'Radni prostor mora imati bar jedan brend.')
  const { error } = await createSupabaseAdminClient()
    .from('brands')
    .update({ deleted_at: new Date().toISOString(), status: 'archived' })
    .eq('id', brandId)
  if (error) throw mapDbError(error)
}
