import { assertViewer, createHandler } from '@/lib/api/handler'
import { templateActivateSchema, templateIdQuerySchema } from '@/lib/schemas/figma'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { listTemplates, removeTemplate, setActiveTemplate } from '@/services/figma/templates'

/** Figma šabloni brenda (D-162) i koji od njih crta objave. */
export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  listTemplates(assertViewer(viewer), params.id),
)

export const PATCH = createHandler(
  { auth: 'user', params: uuidParamSchema, body: templateActivateSchema },
  async ({ viewer, params, body }) => setActiveTemplate(assertViewer(viewer), params.id, body.templateId),
)

export const DELETE = createHandler(
  { auth: 'user', params: uuidParamSchema, query: templateIdQuerySchema },
  async ({ viewer, params, query }) => removeTemplate(assertViewer(viewer), params.id, query.templateId),
)
