import { assertViewer, createHandler } from '@/lib/api/handler'
import { idempotentJson } from '@/lib/api/idempotent-route'
import { jsonOk } from '@/lib/api/response'
import { canvaExportSchema } from '@/lib/schemas/visuals'
import { getBrand } from '@/services/brands'
import { exportCanvaDesign, type CanvaExportResult } from '@/services/canva/designs'
import { requestCanvaVideoExport, type CanvaVideoAccepted } from '@/services/canva/video'

/**
 * Export Canva dizajna u biblioteku brenda; 2 tokena. PNG i JPG stižu u odgovoru, a MP4 je
 * pozadinski posao (D-104): 202 sa ID-jem posla, status na `/api/ai/jobs/[id]`.
 */
export const POST = createHandler(
  {
    auth: 'verified',
    body: canvaExportSchema,
    rateLimit: { name: 'canva', limit: 20, windowSec: 60, by: 'user' },
  },
  async ({ req, viewer, body, requestId }) => {
    const v = assertViewer(viewer)
    const brand = await getBrand(v, body.brandId)
    const result = await idempotentJson<CanvaExportResult | CanvaVideoAccepted>(
      { req, workspaceId: brand.workspace_id, userId: v.user.id, scope: 'canva.export', body },
      async () =>
        body.format === 'mp4'
          ? { status: 202, data: await requestCanvaVideoExport(v, body, { requestId }) }
          : { status: 200, data: await exportCanvaDesign(v, body, { requestId }) },
    )
    return jsonOk(result.data, requestId, {
      status: result.status,
      headers: { 'idempotent-replayed': String(result.replayed) },
    })
  },
)
