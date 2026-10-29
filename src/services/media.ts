import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { env } from '@/lib/env'
import { cropRect } from '@/lib/media/crop'
import { parseMp4, stripVideoMetadata, type VideoInfo } from '@/lib/media/mp4'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import { getBrand } from '@/services/brands'
import type { Database, Json } from '@/types/database'

export type MediaAssetRow = Database['public']['Tables']['media_assets']['Row']

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_DIMENSION = 4096
/** Najmanja stranica isečka; manje od toga mreže odbijaju ili prikazuju mutno. */
const MIN_CROP_SIDE = 200
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const VIDEO_MIME = new Set(['video/mp4', 'video/quicktime'])
const FORMATS_MESSAGE =
  'Dozvoljeni formati su JPG, PNG i WebP za slike i MP4 ili MOV za video (proverava se sadržaj fajla, ne ekstenzija).'

/** Najveći video u bajtovima (`MEDIA_MAX_VIDEO_MB`; Supabase besplatan plan ne prima više od 50 MB). */
export function maxVideoBytes(): number {
  return env.MEDIA_MAX_VIDEO_MB * 1024 * 1024
}

function tooLarge(kind: 'image' | 'video'): ApiError {
  return new ApiError(
    'PAYLOAD_TOO_LARGE',
    kind === 'video'
      ? `Video može imati najviše ${env.MEDIA_MAX_VIDEO_MB} MB.`
      : 'Slika može imati najviše 20 MB.',
  )
}

/** HEIC i GIF imaju svoje poruke (EDGE_CASES U3, U6); ostali nepodržani tipovi dobijaju opštu. */
function unsupportedImage(mime: string): ApiError | null {
  if (mime === 'image/heic' || mime === 'image/heif') {
    return new ApiError(
      'VALIDATION',
      'HEIC format još nije podržan. Sačuvajte fotografiju kao JPEG pa pokušajte ponovo.',
    )
  }
  if (mime === 'image/gif') {
    // EDGE_CASES U6: Sova slike normalizuje bez animacije, a Instagram i TikTok ionako primaju samo mirne slike
    return new ApiError(
      'VALIDATION',
      'GIF još nije podržan. Sačuvajte željenu sličicu kao JPG ili PNG; Instagram i TikTok ionako primaju samo slike bez animacije.',
    )
  }
  return null
}

function folderFor(workspaceId: string, brandId: string | null, leaf: string): string {
  return brandId ? `ws/${workspaceId}/brand/${brandId}/${leaf}` : `ws/${workspaceId}/${leaf}`
}

interface ProcessedImage {
  data: Buffer
  width: number
  height: number
  mime: string
  ext: string
}

/**
 * Ograničenje piksela protiv decompression bomb napada, rotacija po EXIF-u pa uklanjanje EXIF-a,
 * resize na najviše 4096 px, sRGB.
 */
async function processImage(bytes: Buffer, mime: string): Promise<ProcessedImage> {
  let pipeline = sharp(bytes, { limitInputPixels: 50_000_000, animated: false }).rotate()
  const meta = await pipeline.metadata()
  if (!meta.width || !meta.height) throw new ApiError('VALIDATION', 'Slika nije čitljiva.')
  if (meta.width > MAX_DIMENSION || meta.height > MAX_DIMENSION) {
    pipeline = pipeline.resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
  }
  // CMYK → sRGB; bez withMetadata() EXIF se ne prenosi
  return encodeImage(pipeline.toColorspace('srgb'), mime)
}

/** Kodiranje u zadati format (JPG kroz mozjpeg, kvalitet 90), isto za upload i isečak. */
async function encodeImage(pipeline: ReturnType<typeof sharp>, mime: string): Promise<ProcessedImage> {
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
  const output =
    ext === 'png'
      ? await pipeline.png().toBuffer({ resolveWithObject: true })
      : ext === 'webp'
        ? await pipeline.webp({ quality: 90 }).toBuffer({ resolveWithObject: true })
        : await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer({ resolveWithObject: true })
  return {
    data: output.data,
    width: output.info.width,
    height: output.info.height,
    mime: ext === 'jpg' ? 'image/jpeg' : mime,
    ext,
  }
}

/** Isti fajl u istom brendu se ne čuva dvaput; u drugom brendu je poseban medij (objava traži medij svog brenda). */
async function existingBySha(
  workspaceId: string,
  brandId: string | null,
  sha256: string,
): Promise<MediaAssetRow | null> {
  const query = createSupabaseAdminClient()
    .from('media_assets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('sha256', sha256)
    .is('deleted_at', null)
  const { data } = await (brandId ? query.eq('brand_id', brandId) : query.is('brand_id', null))
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data
}

type AssetInsert = Database['public']['Tables']['media_assets']['Insert']

/** Upis fajla i reda; bez reda u bazi fajl bi ostao siroče u skladištu (EDGE_CASES U7). */
async function storeUpload(row: AssetInsert & { id: string; storage_path: string }, bytes: Buffer) {
  const admin = createSupabaseAdminClient()
  const upload = await admin.storage.from('uploads').upload(row.storage_path, bytes, {
    contentType: row.mime_type,
    upsert: false,
    cacheControl: '3600',
  })
  if (upload.error) throw new ApiError('INTERNAL', 'Čuvanje fajla nije uspelo.', { cause: upload.error })
  const inserted = await admin.from('media_assets').insert(row).select('*').single()
  if (inserted.error || !inserted.data) {
    await admin.storage.from('uploads').remove([row.storage_path])
    throw mapDbError(inserted.error, 'Zapis o fajlu nije sačuvan.')
  }
  return inserted.data
}

async function storeImage(
  viewer: Viewer,
  input: { workspaceId: string; brandId: string | null; image: ProcessedImage; originalName: string | null },
): Promise<MediaAssetRow> {
  const sha256 = createHash('sha256').update(input.image.data).digest('hex')
  const existing = await existingBySha(input.workspaceId, input.brandId, sha256)
  if (existing) return existing
  const id = randomUUID()
  return storeUpload(
    {
      id,
      workspace_id: input.workspaceId,
      brand_id: input.brandId,
      kind: 'image',
      source: 'upload',
      bucket: 'uploads',
      storage_path: `${folderFor(input.workspaceId, input.brandId, 'uploads')}/${id}.${input.image.ext}`,
      mime_type: input.image.mime,
      size_bytes: input.image.data.length,
      width: input.image.width,
      height: input.image.height,
      sha256,
      exif_stripped: true,
      uploaded_by: viewer.user.id,
      source_data: input.originalName ? { original_name: input.originalName } : null,
    },
    input.image.data,
  )
}

/**
 * Video iz biblioteke: trajanje i prikazane dimenzije iz MP4/MOV zaglavlja, lokacija i ostali
 * metapodaci snimka uklonjeni bez ponovnog kodiranja (kao EXIF kod slika).
 */
async function storeVideo(
  viewer: Viewer,
  input: {
    workspaceId: string
    brandId: string | null
    bytes: Buffer
    mime: string
    originalName: string | null
  },
): Promise<MediaAssetRow> {
  return storeServerVideo({
    workspaceId: input.workspaceId,
    brandId: input.brandId,
    bytes: input.bytes,
    mime: input.mime,
    source: 'upload',
    folder: 'uploads',
    uploadedBy: viewer.user.id,
    sourceData: input.originalName ? { original_name: input.originalName } : {},
  })
}

/** Isti put za video koji preuzima server (Canva export, D-104); izvor, folder i atribucija po pozivaocu. */
export async function storeServerVideo(input: {
  workspaceId: string
  brandId: string | null
  bytes: Buffer
  mime: string
  source: Database['public']['Enums']['media_source']
  folder: string
  uploadedBy: string | null
  sourceData?: Record<string, Json>
  attribution?: Json
  tags?: string[]
  generationId?: string | null
}): Promise<MediaAssetRow> {
  if (input.bytes.length > maxVideoBytes()) throw tooLarge('video')
  let info: VideoInfo
  try {
    info = parseMp4(input.bytes)
  } catch {
    throw new ApiError(
      'VALIDATION',
      'Video nije čitljiv (oštećen ili nepotpun fajl). Sačuvajte ga ponovo kao MP4 pa pokušajte još jednom.',
    )
  }
  if (info.durationMs < 1000) throw new ApiError('VALIDATION', 'Video je kraći od jedne sekunde.')
  const { data } = stripVideoMetadata(input.bytes)
  const sha256 = createHash('sha256').update(data).digest('hex')
  const existing = await existingBySha(input.workspaceId, input.brandId, sha256)
  if (existing) return existing
  const id = randomUUID()
  const ext = input.mime === 'video/quicktime' ? 'mov' : 'mp4'
  return storeUpload(
    {
      id,
      workspace_id: input.workspaceId,
      brand_id: input.brandId,
      kind: 'video',
      source: input.source,
      bucket: 'uploads',
      storage_path: `${folderFor(input.workspaceId, input.brandId, input.folder)}/${id}.${ext}`,
      mime_type: input.mime,
      size_bytes: data.length,
      width: info.width,
      height: info.height,
      duration_ms: info.durationMs,
      sha256,
      exif_stripped: true,
      uploaded_by: input.uploadedBy,
      ...(input.tags ? { tags: input.tags } : {}),
      ...(input.attribution ? { attribution: input.attribution } : {}),
      ...(input.generationId ? { ai_generation_id: input.generationId } : {}),
      source_data: {
        ...input.sourceData,
        video_codec: info.videoCodec,
        audio_codec: info.audioCodec,
        rotation: info.rotation,
      },
    },
    data,
  )
}

/**
 * Upload slike kroz server (multipart do ~4 MB; pregledač koristi direktno otpremanje ispod):
 * tip po sadržaju (magic bytes), obrada kao `processImage`, privatan bucket `uploads`.
 */
export async function uploadImage(
  viewer: Viewer,
  input: { workspaceId: string; brandId: string | null; bytes: Buffer; originalName?: string },
): Promise<MediaAssetRow> {
  await requireMembership(viewer, input.workspaceId, EDIT_ROLES)
  if (input.brandId) {
    const { data: brand } = await viewer.supabase
      .from('brands')
      .select('id')
      .eq('id', input.brandId)
      .maybeSingle()
    if (!brand) throw new ApiError('NOT_FOUND', 'Brend ne postoji ili nemate pristup.')
  }
  if (input.bytes.length === 0) throw new ApiError('VALIDATION', 'Fajl je prazan.')
  if (input.bytes.length > MAX_IMAGE_BYTES) throw tooLarge('image')

  const detected = await fileTypeFromBuffer(input.bytes)
  const mime = detected?.mime ?? ''
  const unsupported = unsupportedImage(mime)
  if (unsupported) throw unsupported
  if (!ALLOWED_IMAGE_MIME.has(mime)) {
    throw new ApiError(
      'VALIDATION',
      'Dozvoljeni formati su JPG, PNG i WebP (proverava se sadržaj fajla, ne ekstenzija).',
    )
  }
  return storeImage(viewer, {
    workspaceId: input.workspaceId,
    brandId: input.brandId,
    image: await processImage(input.bytes, mime),
    originalName: input.originalName?.slice(0, 200) ?? null,
  })
}

/** Privremena putanja direktnog otpremanja; ID bira server, pa klijent ne može da gađa tuđ fajl. */
function incomingPath(workspaceId: string, brandId: string, uploadId: string): string {
  return `${folderFor(workspaceId, brandId, 'incoming')}/${uploadId}`
}

export interface UploadTarget {
  uploadId: string
  signedUrl: string
  maxBytes: number
}

/**
 * Direktno otpremanje, korak 1 (D-082): pregledač šalje fajl pravo u skladište preko potpisanog
 * URL-a (važi 2 h), mimo Next servera, jer Vercel funkcija ne prima telo veće od 4,5 MB.
 */
export async function createUploadTarget(
  viewer: Viewer,
  input: { brandId: string; mimeType: string; sizeBytes: number },
): Promise<UploadTarget> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const mime = input.mimeType.toLowerCase()
  const unsupported = unsupportedImage(mime)
  if (unsupported) throw unsupported
  const kind = VIDEO_MIME.has(mime) ? 'video' : ALLOWED_IMAGE_MIME.has(mime) ? 'image' : null
  if (!kind) throw new ApiError('VALIDATION', FORMATS_MESSAGE)
  const maxBytes = kind === 'video' ? maxVideoBytes() : MAX_IMAGE_BYTES
  if (input.sizeBytes <= 0) throw new ApiError('VALIDATION', 'Fajl je prazan.')
  if (input.sizeBytes > maxBytes) throw tooLarge(kind)
  const uploadId = randomUUID()
  const { data, error } = await createSupabaseAdminClient()
    .storage.from('uploads')
    .createSignedUploadUrl(incomingPath(brand.workspace_id, brand.id, uploadId))
  if (error || !data)
    throw new ApiError('INTERNAL', 'Adresa za otpremanje nije napravljena.', { cause: error })
  return { uploadId, signedUrl: data.signedUrl, maxBytes }
}

/**
 * Direktno otpremanje, korak 2: tip po sadržaju, slika kroz `processImage`, video kroz MP4 zaglavlje;
 * privremeni fajl se briše u svakom ishodu (napuštene briše dnevni posao `media-incoming-cleanup`).
 */
export async function completeUpload(
  viewer: Viewer,
  input: { brandId: string; uploadId: string; originalName?: string | null },
): Promise<MediaAssetRow> {
  const brand = await getBrand(viewer, input.brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const path = incomingPath(brand.workspace_id, brand.id, input.uploadId)
  const admin = createSupabaseAdminClient()
  const { data: blob, error } = await admin.storage.from('uploads').download(path)
  if (error || !blob) {
    throw new ApiError(
      'NOT_FOUND',
      'Otpremljeni fajl nije pronađen: otpremanje nije završeno ili je prošlo više od dva sata.',
    )
  }
  try {
    const bytes = Buffer.from(await blob.arrayBuffer())
    if (!bytes.length) throw new ApiError('VALIDATION', 'Fajl je prazan.')
    const mime = (await fileTypeFromBuffer(bytes))?.mime ?? ''
    const unsupported = unsupportedImage(mime)
    if (unsupported) throw unsupported
    const target = {
      workspaceId: brand.workspace_id,
      brandId: brand.id,
      originalName: input.originalName?.slice(0, 200) || null,
    }
    if (ALLOWED_IMAGE_MIME.has(mime)) {
      if (bytes.length > MAX_IMAGE_BYTES) throw tooLarge('image')
      return await storeImage(viewer, { ...target, image: await processImage(bytes, mime) })
    }
    if (VIDEO_MIME.has(mime)) return await storeVideo(viewer, { ...target, bytes, mime })
    throw new ApiError('VALIDATION', FORMATS_MESSAGE)
  } finally {
    await admin.storage.from('uploads').remove([path])
  }
}

/** Brisanje napuštenih privremenih fajlova starijih od `olderThanHours` (dnevni posao). */
export async function cleanupIncomingUploads(olderThanHours = 24): Promise<number> {
  const admin = createSupabaseAdminClient()
  const before = new Date(Date.now() - olderThanHours * 3_600_000).toISOString()
  let removed = 0
  for (let round = 0; round < 10; round++) {
    const { data, error } = await admin.rpc('stale_incoming_uploads', { p_before: before, p_limit: 500 })
    if (error) throw mapDbError(error)
    const names = (data ?? []).map((r) => r.name)
    if (!names.length) break
    for (let i = 0; i < names.length; i += 100) {
      const chunk = names.slice(i, i + 100)
      const res = await admin.storage.from('uploads').remove(chunk)
      if (res.error)
        throw new ApiError('INTERNAL', 'Brisanje privremenih fajlova nije uspelo.', { cause: res.error })
      removed += chunk.length
    }
    if (names.length < 500) break
  }
  return removed
}

export async function getAsset(viewer: Viewer, assetId: string): Promise<MediaAssetRow> {
  return unwrap(
    await viewer.supabase
      .from('media_assets')
      .select('*')
      .eq('id', assetId)
      .is('deleted_at', null)
      .maybeSingle(),
    'Fajl ne postoji ili nemate pristup.',
  )
}

/** Potpisan URL za pregled (podrazumevano 1 h). Mreže dobijaju 24 h u fazi 9. */
export async function signedUrl(
  asset: Pick<MediaAssetRow, 'bucket' | 'storage_path'>,
  expiresSec = 3600,
): Promise<string> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.storage
    .from(asset.bucket)
    .createSignedUrl(asset.storage_path, expiresSec)
  if (error || !data) throw new ApiError('INTERNAL', 'Potpisan link nije napravljen.', { cause: error })
  return data.signedUrl
}

export async function downloadAsset(asset: Pick<MediaAssetRow, 'bucket' | 'storage_path'>): Promise<Buffer> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.storage.from(asset.bucket).download(asset.storage_path)
  if (error || !data) throw new ApiError('INTERNAL', 'Fajl nije preuzet iz skladišta.', { cause: error })
  return Buffer.from(await data.arrayBuffer())
}

/**
 * Sečenje slike na odnos stranica mreže (EDGE_CASES N9, D-093): isečak je nova slika u biblioteci, a
 * original ostaje jer može biti u drugim objavama. Isečak nasleđuje izvor, atribuciju (Unsplash), opis
 * i oznaku AI sadržaja originala; `source_data.cropped_from` pamti odakle je.
 */
export async function cropImage(
  viewer: Viewer,
  assetId: string,
  input: { aspect: number; position: number },
): Promise<MediaAssetRow> {
  const asset = await getAsset(viewer, assetId)
  await requireMembership(viewer, asset.workspace_id, EDIT_ROLES)
  if (asset.kind !== 'image') throw new ApiError('VALIDATION', 'Seći se mogu samo slike.')
  const source = sharp(await downloadAsset(asset), { limitInputPixels: 50_000_000, animated: false })
  const meta = await source.metadata()
  if (!meta.width || !meta.height) throw new ApiError('VALIDATION', 'Slika nije čitljiva.')
  // EXIF orijentacija 5–8 zamenjuje širinu i visinu (AI slike nisu prošle `processImage`)
  const turned = (meta.orientation ?? 1) >= 5
  const rect = cropRect(
    turned ? meta.height : meta.width,
    turned ? meta.width : meta.height,
    input.aspect,
    input.position,
  )
  if (rect.width < MIN_CROP_SIDE || rect.height < MIN_CROP_SIDE)
    throw new ApiError('VALIDATION', 'Slika je premala za ovaj odnos stranica.')
  // rotate() pre extract(): sharp prvo okreće po EXIF-u, pa seče
  const image = await encodeImage(
    source.rotate().extract(rect).toColorspace('srgb'),
    ALLOWED_IMAGE_MIME.has(asset.mime_type) ? asset.mime_type : 'image/jpeg',
  )
  const sha256 = createHash('sha256').update(image.data).digest('hex')
  const existing = await existingBySha(asset.workspace_id, asset.brand_id, sha256)
  if (existing) return existing
  const id = randomUUID()
  const original = (asset.source_data as { [key: string]: Json | undefined } | null) ?? {}
  return storeUpload(
    {
      id,
      workspace_id: asset.workspace_id,
      brand_id: asset.brand_id,
      kind: 'image',
      source: asset.source,
      bucket: 'uploads',
      storage_path: `${folderFor(asset.workspace_id, asset.brand_id, 'uploads')}/${id}.${image.ext}`,
      mime_type: image.mime,
      size_bytes: image.data.length,
      width: image.width,
      height: image.height,
      sha256,
      alt_text: asset.alt_text,
      tags: asset.tags,
      attribution: asset.attribution,
      is_ai_generated: asset.is_ai_generated,
      ai_generation_id: asset.ai_generation_id,
      exif_stripped: true,
      uploaded_by: viewer.user.id,
      source_data: { ...original, cropped_from: asset.id, crop: { aspect: input.aspect, ...rect } },
    },
    image.data,
  )
}

/** Čuva generisanu sliku u bucket `generated` i pravi media_assets red (service role). */
export async function storeGeneratedImage(input: {
  workspaceId: string
  brandId: string | null
  bytes: Buffer
  mimeType: string
  generationId: string
  model: string
  prompt: string
  altText?: string | null
  uploadedBy?: string | null
}): Promise<MediaAssetRow> {
  const admin = createSupabaseAdminClient()
  const meta = await sharp(input.bytes).metadata()
  const ext = input.mimeType === 'image/jpeg' ? 'jpg' : input.mimeType === 'image/webp' ? 'webp' : 'png'
  const id = randomUUID()
  const storagePath = `${folderFor(input.workspaceId, input.brandId, 'generated')}/${id}.${ext}`
  const upload = await admin.storage.from('generated').upload(storagePath, input.bytes, {
    contentType: input.mimeType,
    upsert: false,
    cacheControl: '3600',
  })
  if (upload.error)
    throw new ApiError('INTERNAL', 'Čuvanje generisane slike nije uspelo.', { cause: upload.error })
  const { data, error } = await admin
    .from('media_assets')
    .insert({
      id,
      workspace_id: input.workspaceId,
      brand_id: input.brandId,
      kind: 'image',
      source: 'gemini',
      bucket: 'generated',
      storage_path: storagePath,
      mime_type: input.mimeType,
      size_bytes: input.bytes.length,
      width: meta.width ?? null,
      height: meta.height ?? null,
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
      alt_text: input.altText ?? null,
      is_ai_generated: true,
      attribution: { provider: 'gemini', model: input.model },
      source_data: { prompt: input.prompt.slice(0, 2000) },
      ai_generation_id: input.generationId,
      uploaded_by: input.uploadedBy ?? null,
    })
    .select('*')
    .single()
  if (error || !data) {
    await admin.storage.from('generated').remove([storagePath])
    throw mapDbError(error, 'Zapis o generisanoj slici nije sačuvan.')
  }
  return data
}

export interface MediaListItem {
  id: string
  url: string
  kind: 'image' | 'video'
  width: number | null
  height: number | null
  durationMs: number | null
  mimeType: string
  altText: string | null
  source: string
  createdAt: string
}

/** Biblioteka medija brenda (najnovije prve) sa potpisanim URL-ovima za pregled. */
export async function listMedia(
  viewer: Viewer,
  brandId: string,
  limit = 40,
  kind?: 'image' | 'video',
): Promise<MediaListItem[]> {
  const { data: brand } = await viewer.supabase.from('brands').select('id').eq('id', brandId).maybeSingle()
  if (!brand) throw new ApiError('NOT_FOUND', 'Brend ne postoji ili nemate pristup.')
  let query = viewer.supabase
    .from('media_assets')
    .select(
      'id, kind, bucket, storage_path, width, height, duration_ms, mime_type, alt_text, source, created_at',
    )
    .eq('brand_id', brandId)
    .is('deleted_at', null)
  if (kind) query = query.eq('kind', kind)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit)
  if (error) throw mapDbError(error)
  return Promise.all(
    (data ?? []).map(async (m) => ({
      id: m.id,
      url: await signedUrl(m),
      kind: m.kind,
      width: m.width,
      height: m.height,
      durationMs: m.duration_ms,
      mimeType: m.mime_type,
      altText: m.alt_text,
      source: m.source,
      createdAt: m.created_at,
    })),
  )
}

/**
 * Brisanje iz biblioteke (meko, `deleted_at`): okidač `media_in_use_guard` odbija medij koji je u
 * zakazanoj ili objavljivanoj objavi (EDGE_CASES U9), pa korisnik prvo menja medij u objavi.
 * Piše kroz service role posle provere: SELECT politika skriva obrisan red, pa bi UPDATE kroz
 * korisnički klijent pao sa 42501 (D-081).
 */
export async function deleteMediaAsset(viewer: Viewer, assetId: string): Promise<void> {
  const asset = await getAsset(viewer, assetId)
  await requireMembership(viewer, asset.workspace_id, EDIT_ROLES)
  const { error } = await createSupabaseAdminClient()
    .from('media_assets')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', assetId)
  if (error) throw mapDbError(error)
}
