import { z } from 'zod'

import { ApiError } from '@/lib/api/errors'
import { assertViewer, createHandler } from '@/lib/api/handler'
import { MAX_IMAGE_BYTES, signedUrl, uploadImage } from '@/services/media'

const fieldsSchema = z.object({
  workspaceId: z.uuid(),
  brandId: z.uuid().optional(),
})

/**
 * Upload slike (multipart/form-data: file, workspaceId, brandId?).
 * Tip se proverava po sadržaju, EXIF se uklanja, fajl ide u privatan bucket.
 */
export const POST = createHandler(
  { auth: 'verified', rateLimit: { name: 'media-upload', limit: 30, windowSec: 60, by: 'user' } },
  async ({ req, viewer }) => {
    const v = assertViewer(viewer)
    const length = Number(req.headers.get('content-length') ?? 0)
    if (length > MAX_IMAGE_BYTES + 64 * 1024)
      throw new ApiError('PAYLOAD_TOO_LARGE', 'Slika može imati najviše 20 MB.')

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      throw new ApiError('VALIDATION', 'Očekuje se multipart/form-data sa poljem file.')
    }
    const parsed = fieldsSchema.safeParse({
      workspaceId: form.get('workspaceId')?.toString(),
      brandId: form.get('brandId')?.toString() || undefined,
    })
    if (!parsed.success) throw new ApiError('VALIDATION', 'Nedostaje workspaceId ili brandId nije ispravan.')
    const file = form.get('file')
    if (!(file instanceof File)) throw new ApiError('VALIDATION', 'Polje file je obavezno.')
    if (file.size > MAX_IMAGE_BYTES)
      throw new ApiError('PAYLOAD_TOO_LARGE', 'Slika može imati najviše 20 MB.')

    const bytes = Buffer.from(await file.arrayBuffer())
    const asset = await uploadImage(v, {
      workspaceId: parsed.data.workspaceId,
      brandId: parsed.data.brandId ?? null,
      bytes,
      originalName: file.name,
    })
    return {
      id: asset.id,
      mimeType: asset.mime_type,
      width: asset.width,
      height: asset.height,
      sizeBytes: asset.size_bytes,
      url: await signedUrl(asset),
    }
  },
)
