import { assertViewer, createHandler } from '@/lib/api/handler'
import { updateDesignSchema } from '@/lib/schemas/design'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { getDesignView, updateDesign } from '@/services/design/brand-design'

/** Dizajn brenda (D-108): stil, format, izvor fotografija, broj slajdova, boje i nalog na slajdovima. */
export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  getDesignView(assertViewer(viewer), params.id),
)

export const PATCH = createHandler(
  { auth: 'user', params: uuidParamSchema, body: updateDesignSchema },
  async ({ viewer, params, body }) => updateDesign(assertViewer(viewer), params.id, body),
)
