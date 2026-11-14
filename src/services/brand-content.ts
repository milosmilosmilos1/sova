import 'server-only'

import { randomBytes } from 'node:crypto'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import {
  CONTENT_INPUT_SCHEMAS,
  CONTENT_KINDS,
  CONTENT_LIST_MAX,
  kindState,
  storedContent,
  type BeforeAfterInput,
  type BeforeAfterPair,
  type ContentKind,
  type ContentList,
  type KindState,
  type StoredContent,
  type TeamMember,
  type TeamMemberInput,
  type Testimonial,
} from '@/lib/schemas/brand-content'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { getBrand, type BrandRow } from '@/services/brands'
import { signedUrl } from '@/services/media-urls'
import type { Json } from '@/types/database'

/**
 * Podaci za vrste objava D-165: utisci klijenata, tim i parovi pre i posle, plus prekidač po vrsti.
 * Čuvaju se u `brands.settings.content` (bez migracije). Fotografije su slike iz biblioteke brenda.
 */
export interface BrandContentView {
  kinds: Record<ContentKind, KindState>
  testimonials: Testimonial[]
  team: Array<TeamMember & { photoUrl: string | null }>
  pairs: Array<BeforeAfterPair & { beforeUrl: string | null; afterUrl: string | null }>
  canEdit: boolean
}

function newId(): string {
  return randomBytes(5).toString('hex')
}

async function editableBrand(viewer: Viewer, brandId: string): Promise<BrandRow> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  return brand
}

/** Sveža podešavanja iz baze (ne iz pamćenja zahteva), da izmena ne pregazi druge ključeve. */
async function readFresh(
  brandId: string,
): Promise<{ settings: Record<string, Json>; content: StoredContent }> {
  const { data, error } = await createSupabaseAdminClient()
    .from('brands')
    .select('settings')
    .eq('id', brandId)
    .single()
  if (error) throw mapDbError(error)
  const settings = (data?.settings as Record<string, Json> | null) ?? {}
  return { settings, content: storedContent(settings) }
}

async function writeContent(brandId: string, settings: Record<string, Json>, content: StoredContent) {
  const { error } = await createSupabaseAdminClient()
    .from('brands')
    .update({ settings: { ...settings, content: content as unknown as Json } })
    .eq('id', brandId)
  if (error) throw mapDbError(error)
}

/** Fotografija mora biti slika iz biblioteke ovog brenda (ili radnog prostora, bez brenda). */
async function assertBrandImages(viewer: Viewer, brand: BrandRow, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)]
  if (!unique.length) return
  const { data, error } = await viewer.supabase
    .from('media_assets')
    .select('id, kind, brand_id, workspace_id')
    .in('id', unique)
    .is('deleted_at', null)
  if (error) throw mapDbError(error)
  const ok = (data ?? []).filter(
    (a) =>
      a.kind === 'image' &&
      a.workspace_id === brand.workspace_id &&
      (a.brand_id === null || a.brand_id === brand.id),
  )
  if (ok.length !== unique.length)
    throw new ApiError('VALIDATION', 'Fotografija mora biti slika iz biblioteke ovog brenda.')
}

function photoIds(list: ContentList, item: TeamMemberInput | BeforeAfterInput | object): string[] {
  if (list === 'team') return [(item as TeamMemberInput).photoAssetId].filter((x): x is string => Boolean(x))
  if (list === 'pairs')
    return [(item as BeforeAfterInput).beforeAssetId, (item as BeforeAfterInput).afterAssetId]
  return []
}

export async function getBrandContent(viewer: Viewer, brandId: string): Promise<BrandContentView> {
  const brand = await getBrand(viewer, brandId)
  const membership = await requireMembership(viewer, brand.workspace_id)
  const content = storedContent(brand.settings)
  const ids = [
    ...content.team.map((m) => m.photoAssetId),
    ...content.pairs.flatMap((p) => [p.beforeAssetId, p.afterAssetId]),
  ].filter((x): x is string => Boolean(x))
  const { data: assets } = ids.length
    ? await viewer.supabase
        .from('media_assets')
        .select('id, bucket, storage_path')
        .in('id', [...new Set(ids)])
        .is('deleted_at', null)
    : { data: [] }
  // svi potpisi u jednom pozivu po bucket-u (media-urls)
  const urls = new Map(
    await Promise.all((assets ?? []).map(async (a) => [a.id, await signedUrl(a).catch(() => null)] as const)),
  )
  const url = (id: string | null) => (id ? (urls.get(id) ?? null) : null)
  return {
    kinds: Object.fromEntries(CONTENT_KINDS.map((k) => [k, kindState(content, k)])) as Record<
      ContentKind,
      KindState
    >,
    testimonials: content.testimonials,
    team: content.team.map((m) => ({ ...m, photoUrl: url(m.photoAssetId) })),
    pairs: content.pairs.map((p) => ({
      ...p,
      beforeUrl: url(p.beforeAssetId),
      afterUrl: url(p.afterAssetId),
    })),
    canEdit: EDIT_ROLES.includes(membership.role),
  }
}

export async function setContentKinds(
  viewer: Viewer,
  brandId: string,
  kinds: Partial<Record<ContentKind, KindState>>,
): Promise<BrandContentView> {
  await editableBrand(viewer, brandId)
  const { settings, content } = await readFresh(brandId)
  const next: StoredContent['kinds'] = { ...content.kinds }
  for (const kind of CONTENT_KINDS) {
    const state = kinds[kind]
    if (state === undefined) continue
    if (state === 'auto') delete next[kind]
    else next[kind] = state === 'on'
  }
  await writeContent(brandId, settings, { ...content, kinds: next })
  return getBrandContent(viewer, brandId)
}

export async function addContentItem(
  viewer: Viewer,
  brandId: string,
  list: ContentList,
  input: unknown,
): Promise<BrandContentView> {
  const brand = await editableBrand(viewer, brandId)
  const parsed = CONTENT_INPUT_SCHEMAS[list].parse(input)
  await assertBrandImages(viewer, brand, photoIds(list, parsed))
  const { settings, content } = await readFresh(brandId)
  if (content[list].length >= CONTENT_LIST_MAX[list])
    throw new ApiError('PLAN_LIMIT', 'Lista je puna: obrišite neku stariju stavku.')
  const item = { ...parsed, id: newId(), createdAt: new Date().toISOString(), usedAt: null }
  await writeContent(brandId, settings, {
    ...content,
    [list]: [item, ...(content[list] as unknown[])],
  } as StoredContent)
  return getBrandContent(viewer, brandId)
}

export async function updateContentItem(
  viewer: Viewer,
  brandId: string,
  list: ContentList,
  itemId: string,
  input: unknown,
): Promise<BrandContentView> {
  const brand = await editableBrand(viewer, brandId)
  const parsed = CONTENT_INPUT_SCHEMAS[list].parse(input)
  await assertBrandImages(viewer, brand, photoIds(list, parsed))
  const { settings, content } = await readFresh(brandId)
  const items = content[list] as Array<{ id: string; createdAt: string; usedAt: string | null }>
  const index = items.findIndex((i) => i.id === itemId)
  if (index < 0) throw new ApiError('NOT_FOUND', 'Stavka ne postoji ili je obrisana.')
  const current = items[index]!
  const next = [...items]
  next[index] = { ...parsed, id: current.id, createdAt: current.createdAt, usedAt: current.usedAt }
  await writeContent(brandId, settings, { ...content, [list]: next } as StoredContent)
  return getBrandContent(viewer, brandId)
}

/**
 * Stavke koje je plan uzeo dobijaju `usedAt`, da sledeći plan prvo uzme druge (D-165). Bez provere
 * prava: zove je pozadinski posao plana, koji je proverio prava kad je plan zatražen.
 */
export async function markContentUsed(brandId: string, ids: string[], at = new Date().toISOString()) {
  if (!ids.length) return
  const used = new Set(ids)
  const { settings, content } = await readFresh(brandId)
  const touch = <T extends { id: string; usedAt: string | null }>(items: T[]) =>
    items.map((i) => (used.has(i.id) ? { ...i, usedAt: at } : i))
  await writeContent(brandId, settings, {
    ...content,
    testimonials: touch(content.testimonials),
    team: touch(content.team),
    pairs: touch(content.pairs),
  })
}

export async function removeContentItem(
  viewer: Viewer,
  brandId: string,
  list: ContentList,
  itemId: string,
): Promise<BrandContentView> {
  await editableBrand(viewer, brandId)
  const { settings, content } = await readFresh(brandId)
  const items = content[list] as Array<{ id: string }>
  if (!items.some((i) => i.id === itemId))
    throw new ApiError('NOT_FOUND', 'Stavka ne postoji ili je obrisana.')
  await writeContent(brandId, settings, {
    ...content,
    [list]: items.filter((i) => i.id !== itemId),
  } as StoredContent)
  return getBrandContent(viewer, brandId)
}
