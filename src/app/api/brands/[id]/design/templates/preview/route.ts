import { assertViewer, createHandler } from '@/lib/api/handler'
import { templatePreviewQuerySchema } from '@/lib/schemas/figma'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { templatePreview } from '@/services/figma/templates'

/** Pregled Figma šablona sa primerom teksta i logoom brenda (D-162), PNG širine 360. */
export const GET = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    query: templatePreviewQuerySchema,
    rateLimit: { name: 'template-preview', limit: 60, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, query }) => {
    const png = await templatePreview(assertViewer(viewer), params.id, query.templateId, query.kind)
    return new Response(new Uint8Array(png), {
      headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=300' },
    })
  },
)
