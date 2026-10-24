import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { applyManualChanges, toBrandContext, type BrandContextFromProfile } from '@/lib/brand/compose'
import {
  brandProfileSchema,
  emptyProfile,
  valueSchemaFor,
  type BrandProfile,
  type FieldPath,
} from '@/lib/brand/profile-schema'
import type { UpdateProfileInput } from '@/lib/schemas/brand'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import { getBrand } from '@/services/brands'
import type { Database, Json } from '@/types/database'

export type ProfileRow = Database['public']['Tables']['brand_profiles']['Row']

export interface ProfileVersionSummary {
  id: string
  version: number
  isCurrent: boolean
  generatedBy: BrandProfile['meta']['generated_by']
  model: string | null
  crawlId: string | null
  createdBy: string | null
  createdAt: string
  overallConfidence: number
}

export interface ProfileView {
  brandId: string
  exists: boolean
  version: number | null
  lockedFields: string[]
  profile: BrandProfile
  versions: ProfileVersionSummary[]
  knowledgeChunks: number
  logoUrl: string | null
}

/** Parsira `data` kolonu; neispravan JSON (stara šema) daje prazan profil da UI ne padne. */
export function parseProfile(
  data: Json,
  fallback: {
    name: string
    contentLocale: BrandProfile['identity']['content_locale']['value']
    websiteUrl: string | null
  },
): BrandProfile {
  const parsed = brandProfileSchema.safeParse(data)
  return parsed.success ? parsed.data : emptyProfile(fallback)
}

export async function getCurrentProfileRow(brandId: string): Promise<ProfileRow | null> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('brand_profiles')
    .select('*')
    .eq('brand_id', brandId)
    .eq('is_current', true)
    .maybeSingle()
  return data
}

function summary(row: ProfileRow): ProfileVersionSummary {
  const meta = (row.data as { meta?: Partial<BrandProfile['meta']> } | null)?.meta ?? {}
  return {
    id: row.id,
    version: row.version,
    isCurrent: row.is_current,
    generatedBy: meta.generated_by ?? 'manual',
    model: meta.model ?? null,
    crawlId: row.crawl_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    overallConfidence: meta.overall_confidence ?? 0,
  }
}

export async function getProfileView(viewer: Viewer, brandId: string): Promise<ProfileView> {
  const brand = await getBrand(viewer, brandId)
  const { data: rows, error } = await viewer.supabase
    .from('brand_profiles')
    .select('*')
    .eq('brand_id', brandId)
    .order('version', { ascending: false })
    .limit(20)
  if (error) throw mapDbError(error)
  const current = (rows ?? []).find((r) => r.is_current) ?? null
  const fallback = {
    name: brand.name,
    contentLocale: brand.content_locale as BrandProfile['identity']['content_locale']['value'],
    websiteUrl: brand.website_url,
  }
  const profile = current ? parseProfile(current.data, fallback) : emptyProfile(fallback)
  const { data: chunkCount } = await viewer.supabase.rpc('brand_knowledge_count', { p_brand_id: brandId })
  let logoUrl: string | null = null
  const logoId = profile.visual.logo.value.asset_id ?? brand.logo_asset_id
  if (logoId) {
    const { data: asset } = await viewer.supabase
      .from('media_assets')
      .select('bucket, storage_path')
      .eq('id', logoId)
      .maybeSingle()
    if (asset) {
      const admin = createSupabaseAdminClient()
      const { data: signed } = await admin.storage
        .from(asset.bucket)
        .createSignedUrl(asset.storage_path, 3600)
      logoUrl = signed?.signedUrl ?? null
    }
  }
  return {
    brandId,
    exists: Boolean(current),
    version: current?.version ?? null,
    lockedFields: current?.locked_fields ?? [],
    profile,
    versions: (rows ?? []).map(summary),
    knowledgeChunks: chunkCount ?? 0,
    logoUrl,
  }
}

/** Ubacuje novu verziju kao trenutnu (sistem ili korisnik). Trigger gasi `is_current` starim verzijama. */
export async function insertProfileVersion(input: {
  brandId: string
  profile: BrandProfile
  lockedFields: string[]
  crawlId: string | null
  createdBy: string | null
  client?: Viewer['supabase']
}): Promise<{ id: string; version: number }> {
  const client = input.client ?? createSupabaseAdminClient()
  const { data: version, error: vErr } = await client.rpc('next_brand_profile_version', {
    p_brand_id: input.brandId,
  })
  if (vErr) throw mapDbError(vErr)
  const row = unwrap(
    await client
      .from('brand_profiles')
      .insert({
        brand_id: input.brandId,
        version: version ?? 1,
        data: input.profile as unknown as NonNullable<Json>,
        locked_fields: input.lockedFields,
        is_current: true,
        crawl_id: input.crawlId,
        created_by: input.createdBy,
      })
      .select('id, version')
      .single(),
    'Profil nije sačuvan.',
  )
  return row
}

/** Ručna izmena polja: nova verzija, polja se zaključavaju da ih buduće analize ne pregaze (brif 5.6). */
export async function updateProfileFields(
  viewer: Viewer,
  brandId: string,
  input: UpdateProfileInput,
): Promise<ProfileView> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const view = await getProfileView(viewer, brandId)

  const fieldErrors: Record<string, string[]> = {}
  const changes: Array<{ path: FieldPath; value: unknown }> = []
  for (const c of input.changes) {
    const parsed = valueSchemaFor(c.path).safeParse(c.value)
    if (!parsed.success) {
      fieldErrors[c.path] = parsed.error.issues.map((i) => i.message).slice(0, 3)
      continue
    }
    changes.push({ path: c.path, value: parsed.data })
  }
  if (Object.keys(fieldErrors).length) {
    throw new ApiError('VALIDATION', 'Neke vrednosti nisu ispravne.', { fields: fieldErrors })
  }

  const next = applyManualChanges(view.profile, changes, view.lockedFields)
  await insertProfileVersion({
    brandId,
    profile: next.profile,
    lockedFields: next.lockedFields,
    crawlId: null,
    createdBy: viewer.user.id,
    client: viewer.supabase,
  })
  return getProfileView(viewer, brandId)
}

/** Otključavanje polja: sledeća analiza sme ponovo da ih popuni. */
export async function unlockProfileFields(
  viewer: Viewer,
  brandId: string,
  paths: FieldPath[],
): Promise<ProfileView> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const current = await getCurrentProfileRow(brandId)
  if (!current) throw new ApiError('NOT_FOUND', 'Profil još ne postoji.')
  const remaining = current.locked_fields.filter((p) => !(paths as string[]).includes(p))
  const { error } = await viewer.supabase
    .from('brand_profiles')
    .update({ locked_fields: remaining })
    .eq('id', current.id)
  if (error) throw mapDbError(error)
  return getProfileView(viewer, brandId)
}

/** Vraćanje starije verzije: kopira se kao nova verzija (istorija ostaje linearna). */
export async function restoreProfileVersion(
  viewer: Viewer,
  brandId: string,
  version: number,
): Promise<ProfileView> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const row = unwrap(
    await viewer.supabase
      .from('brand_profiles')
      .select('*')
      .eq('brand_id', brandId)
      .eq('version', version)
      .maybeSingle(),
    'Ta verzija profila ne postoji.',
  )
  if (row.is_current) throw new ApiError('CONFLICT', 'Ta verzija je već trenutna.')
  const profile = parseProfile(row.data, {
    name: brand.name,
    contentLocale: brand.content_locale as BrandProfile['identity']['content_locale']['value'],
    websiteUrl: brand.website_url,
  })
  profile.meta = { ...profile.meta, generated_by: 'manual', generated_at: new Date().toISOString() }
  await insertProfileVersion({
    brandId,
    profile,
    lockedFields: row.locked_fields,
    crawlId: row.crawl_id,
    createdBy: viewer.user.id,
    client: viewer.supabase,
  })
  return getProfileView(viewer, brandId)
}

/** Kontekst za AI generisanje: profil ako postoji, inače null (poziva faza 5 `text.ts`). */
export async function getBrandContextForBrand(brandId: string): Promise<BrandContextFromProfile | null> {
  const row = await getCurrentProfileRow(brandId)
  if (!row) return null
  const parsed = brandProfileSchema.safeParse(row.data)
  if (!parsed.success) return null
  return toBrandContext(parsed.data)
}
