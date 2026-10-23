import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError, unwrap } from '@/lib/supabase/errors'
import type { Database } from '@/types/database'

export type MediaAssetRow = Database['public']['Tables']['media_assets']['Row']

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_DIMENSION = 4096
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * Upload slike: tip po sadržaju (magic bytes), ograničenje piksela protiv
 * decompression bomb napada, uklanjanje EXIF-a, resize na najviše 4096 px,
 * upis u privatan bucket `uploads` i red u media_assets.
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
  if (input.bytes.length > MAX_IMAGE_BYTES) {
    throw new ApiError('PAYLOAD_TOO_LARGE', 'Slika može imati najviše 20 MB.')
  }

  const detected = await fileTypeFromBuffer(input.bytes)
  const mime = detected?.mime ?? ''
  if (mime === 'image/heic' || mime === 'image/heif') {
    throw new ApiError(
      'VALIDATION',
      'HEIC format još nije podržan. Sačuvajte fotografiju kao JPEG pa pokušajte ponovo.',
    )
  }
  if (!ALLOWED_IMAGE_MIME.has(mime)) {
    throw new ApiError(
      'VALIDATION',
      'Dozvoljeni formati su JPG, PNG i WebP (proverava se sadržaj fajla, ne ekstenzija).',
    )
  }

  let pipeline = sharp(input.bytes, { limitInputPixels: 50_000_000, animated: false }).rotate()
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
  pipeline = pipeline.toColorspace('srgb')
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
  const output =
    ext === 'png'
      ? await pipeline.png().toBuffer({ resolveWithObject: true })
      : ext === 'webp'
        ? await pipeline.webp({ quality: 90 }).toBuffer({ resolveWithObject: true })
        : await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer({ resolveWithObject: true })

  const sha256 = createHash('sha256').update(output.data).digest('hex')
  const admin = createSupabaseAdminClient()

  const existing = await admin
    .from('media_assets')
    .select('*')
    .eq('workspace_id', input.workspaceId)
    .eq('sha256', sha256)
    .is('deleted_at', null)
    .maybeSingle()
  if (existing.data) return existing.data

  const id = randomUUID()
  const folder = input.brandId
    ? `ws/${input.workspaceId}/brand/${input.brandId}/uploads`
    : `ws/${input.workspaceId}/uploads`
  const storagePath = `${folder}/${id}.${ext}`
  const upload = await admin.storage.from('uploads').upload(storagePath, output.data, {
    contentType: mime,
    upsert: false,
    cacheControl: '3600',
  })
  if (upload.error) throw new ApiError('INTERNAL', 'Čuvanje fajla nije uspelo.', { cause: upload.error })

  const row = unwrap(
    await admin
      .from('media_assets')
      .insert({
        id,
        workspace_id: input.workspaceId,
        brand_id: input.brandId,
        kind: 'image',
        source: 'upload',
        bucket: 'uploads',
        storage_path: storagePath,
        mime_type: mime,
        size_bytes: output.data.length,
        width: output.info.width,
        height: output.info.height,
        sha256,
        exif_stripped: true,
        uploaded_by: viewer.user.id,
        source_data: input.originalName ? { original_name: input.originalName.slice(0, 200) } : null,
      })
      .select('*')
      .single(),
    'Zapis o fajlu nije sačuvan.',
  )
  return row
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
  const folder = input.brandId
    ? `ws/${input.workspaceId}/brand/${input.brandId}/generated`
    : `ws/${input.workspaceId}/generated`
  const storagePath = `${folder}/${id}.${ext}`
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
  if (error || !data) throw mapDbError(error, 'Zapis o generisanoj slici nije sačuvan.')
  return data
}
