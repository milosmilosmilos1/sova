import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import sharp from 'sharp'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { getCrawlDeps } from '@/lib/crawler/deps'
import { fetchPage, isFailure } from '@/lib/crawler/fetch-page'
import { fetchLogos, loadLogo, type LogoResult } from '@/lib/crawler/logo'
import { logger } from '@/lib/logger'
import { normalizeUrl } from '@/lib/ssrf'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getBrand, type BrandRow } from '@/services/brands'

import { updateDesign, type ResolvedDesign } from './brand-design'

/**
 * Logo sa sajta (D-148). Analiza brenda čuva prvi upotrebljiv logo sa početne strane; kad pogreši
 * (logo klijenta, ikonica umesto natpisa), korisnik bira drugi sa iste strane ili otprema svoj.
 * Izabran logo postaje logo brenda za objave, naslovne i profilnu sliku.
 */

const LOGO_MIME_OK = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])

/**
 * Logo u biblioteci brenda (`brand-assets`). Isti fajl kao ranije ostaje ista slika, pa objave
 * nacrtane njime ostaju u temi; format koji slajd ne čita (ikonica, GIF) čuva se kao PNG.
 */
export async function storeLogoAsset(input: {
  workspaceId: string
  brandId: string
  logo: LogoResult
  /** polja za log greške (npr. `crawlId` analize) */
  log?: Record<string, unknown>
}): Promise<{ assetId: string; mimeType: string } | null> {
  const { workspaceId, brandId, logo } = input
  const admin = createSupabaseAdminClient()
  const usePng = !LOGO_MIME_OK.has(logo.mimeType)
  const bytes = usePng ? logo.png : logo.bytes
  const mimeType = usePng ? 'image/png' : logo.mimeType
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const { data: same } = await admin
    .from('media_assets')
    .select('id, mime_type')
    .eq('brand_id', brandId)
    .eq('sha256', sha256)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (same) return { assetId: same.id, mimeType: same.mime_type }
  const ext =
    mimeType === 'image/svg+xml'
      ? 'svg'
      : mimeType === 'image/jpeg'
        ? 'jpg'
        : mimeType === 'image/webp'
          ? 'webp'
          : 'png'
  const id = randomUUID()
  const storagePath = `ws/${workspaceId}/brand/${brandId}/logo/${id}.${ext}`
  const upload = await admin.storage
    .from('brand-assets')
    .upload(storagePath, bytes, { contentType: mimeType, upsert: false })
  if (upload.error) {
    logger.warn('logo_upload_failed', { ...input.log, brandId, error: upload.error })
    return null
  }
  const { error } = await admin.from('media_assets').insert({
    id,
    workspace_id: workspaceId,
    brand_id: brandId,
    kind: 'image',
    source: 'upload',
    bucket: 'brand-assets',
    storage_path: storagePath,
    mime_type: mimeType,
    size_bytes: bytes.length,
    width: logo.width,
    height: logo.height,
    sha256,
    alt_text: 'Logo',
    tags: ['logo'],
    attribution: { source: 'website', url: logo.sourceUrl, reason: logo.reason },
    is_ai_generated: false,
    uploaded_by: null,
  })
  if (error) {
    logger.warn('logo_asset_insert_failed', { ...input.log, brandId, error })
    await admin.storage.from('brand-assets').remove([storagePath])
    return null
  }
  return { assetId: id, mimeType }
}

export interface SiteLogoOption {
  sourceUrl: string
  /** gde je nađen: JSON-LD, zaglavlje, futer, og:image, ikonica */
  reason: string
  /** PNG data URI do 240 px, samo za izbor na ekranu */
  preview: string
  width: number
  height: number
}

/** Kandidati za logo sa početne strane sajta brenda, redom po skoru. */
async function homeCandidates(brand: BrandRow) {
  if (!brand.website_url)
    throw new ApiError(
      'VALIDATION',
      'Brend nema sajt. Otpremite logo ili dodajte sajt u podešavanjima brenda.',
    )
  const deps = getCrawlDeps()
  const page = await fetchPage(normalizeUrl(brand.website_url).toString(), deps, {
    timeoutMs: 12_000,
    maxBytes: 3 * 1024 * 1024,
  })
  if (isFailure(page))
    throw new ApiError('PROVIDER_ERROR', 'Sajt nije mogao da se otvori. Otpremite logo sa računara.')
  return { candidates: page.logoCandidates, deps }
}

/** Do četiri logoa sa sajta za izbor; ništa se ne čuva dok korisnik ne izabere. */
export async function listSiteLogos(viewer: Viewer, brandId: string): Promise<{ logos: SiteLogoOption[] }> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const { candidates, deps } = await homeCandidates(brand)
  const found = await fetchLogos(candidates, deps, 4)
  const logos = await Promise.all(
    found.map(async (l) => {
      const preview = await sharp(l.png)
        .resize({ width: 240, height: 240, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer()
      return {
        sourceUrl: l.sourceUrl,
        reason: l.reason,
        preview: `data:image/png;base64,${preview.toString('base64')}`,
        width: l.width,
        height: l.height,
      }
    }),
  )
  return { logos }
}

/**
 * Izabran logo sa sajta postaje logo brenda. Adresa mora biti među kandidatima sa sajta i sada:
 * server ne preuzima adrese koje mu klijent pošalje mimo toga.
 */
export async function pickSiteLogo(
  viewer: Viewer,
  brandId: string,
  sourceUrl: string,
): Promise<ResolvedDesign> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const { candidates, deps } = await homeCandidates(brand)
  const candidate = candidates.find((c) => c.src === sourceUrl)
  if (!candidate)
    throw new ApiError('VALIDATION', 'Tog logoa više nema na sajtu. Osvežite izbor ili otpremite logo.')
  const logo = await loadLogo(candidate, deps)
  if (!logo) throw new ApiError('PROVIDER_ERROR', 'Logo sa sajta nije mogao da se preuzme. Otpremite ga.')
  const stored = await storeLogoAsset({ workspaceId: brand.workspace_id, brandId: brand.id, logo })
  if (!stored) throw new ApiError('INTERNAL', 'Logo nije sačuvan. Pokušajte ponovo.')
  return updateDesign(viewer, brand.id, { logoAssetId: stored.assetId })
}
