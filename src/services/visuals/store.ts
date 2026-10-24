import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import sharp from 'sharp'

import { ApiError } from '@/lib/api/errors'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import type { MediaAssetRow } from '@/services/media'
import type { Database, Json } from '@/types/database'

type MediaSource = Database['public']['Enums']['media_source']

/**
 * Čuvanje slike koju je napravio ili preuzeo server (šablon, Unsplash, Canva export) u Storage
 * i `media_assets`. Bucket po izvoru: generisano ide u `generated`, preuzeto u `uploads`.
 */
export async function storeServerImage(input: {
  workspaceId: string
  brandId: string | null
  bytes: Buffer
  mimeType: string
  source: MediaSource
  folder: string
  attribution?: Json | null
  sourceData?: Json | null
  altText?: string | null
  tags?: string[]
  isAiGenerated?: boolean
  generationId?: string | null
  uploadedBy?: string | null
}): Promise<MediaAssetRow> {
  const admin = createSupabaseAdminClient()
  const meta = await sharp(input.bytes).metadata()
  const ext = input.mimeType === 'image/jpeg' ? 'jpg' : input.mimeType === 'image/webp' ? 'webp' : 'png'
  const bucket = input.source === 'template' || input.source === 'gemini' ? 'generated' : 'uploads'
  const id = randomUUID()
  const base = input.brandId ? `ws/${input.workspaceId}/brand/${input.brandId}` : `ws/${input.workspaceId}`
  const storagePath = `${base}/${input.folder}/${id}.${ext}`
  const upload = await admin.storage.from(bucket).upload(storagePath, input.bytes, {
    contentType: input.mimeType,
    upsert: false,
    cacheControl: '3600',
  })
  if (upload.error) throw new ApiError('INTERNAL', 'Čuvanje slike nije uspelo.', { cause: upload.error })
  const { data, error } = await admin
    .from('media_assets')
    .insert({
      id,
      workspace_id: input.workspaceId,
      brand_id: input.brandId,
      kind: 'image',
      source: input.source,
      bucket,
      storage_path: storagePath,
      mime_type: input.mimeType,
      size_bytes: input.bytes.length,
      width: meta.width ?? null,
      height: meta.height ?? null,
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
      alt_text: input.altText ?? null,
      tags: input.tags ?? [],
      attribution: (input.attribution ?? null) as NonNullable<Json> | null,
      source_data: (input.sourceData ?? null) as NonNullable<Json> | null,
      is_ai_generated: input.isAiGenerated ?? false,
      ai_generation_id: input.generationId ?? null,
      uploaded_by: input.uploadedBy ?? null,
    })
    .select('*')
    .single()
  if (error || !data) throw mapDbError(error, 'Zapis o slici nije sačuvan.')
  return data
}
