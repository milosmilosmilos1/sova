import { assertViewer, createHandler } from '@/lib/api/handler'
import { templatePreviewSchema } from '@/lib/schemas/templates'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { previewTemplate } from '@/services/templates'

export const maxDuration = 30

/** Pregled slajdova i predlog opisa dok se šablon popunjava (D-175); ništa se ne čuva. */
export const POST = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    body: templatePreviewSchema,
    rateLimit: { name: 'template-preview', limit: 120, windowSec: 600, by: 'user' },
  },
  async ({ viewer, params, body }) => previewTemplate(assertViewer(viewer), params.id, body),
)
