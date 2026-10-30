import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { automationSchema, automationsQuerySchema } from '@/lib/schemas/inbox'
import { createAutomation, listAutomations } from '@/services/inbox/automations'

/** DM automatizacija (D-117): tokovi, kontakti, ukupni rezultat i nalozi. */
export const GET = createHandler({ auth: 'user', query: automationsQuerySchema }, async ({ viewer, query }) =>
  listAutomations(assertViewer(viewer), query.brandId),
)

export const POST = createHandler(
  {
    auth: 'user',
    body: automationSchema,
    rateLimit: { name: 'automations', limit: 30, windowSec: 60, by: 'user' },
  },
  async ({ viewer, body, requestId }) =>
    jsonOk(await createAutomation(assertViewer(viewer), body), requestId, { status: 201 }),
)
