import { assertViewer, createHandler } from '@/lib/api/handler'
import { automationParamsSchema, automationUpdateSchema } from '@/lib/schemas/inbox'
import { deleteAutomation, updateAutomation } from '@/services/inbox/automations'

/** Izmena toka, uključivanje i isključivanje. */
export const PATCH = createHandler(
  { auth: 'user', params: automationParamsSchema, body: automationUpdateSchema },
  async ({ viewer, params, body }) => updateAutomation(assertViewer(viewer), params.id, body),
)

/** Brisanje toka; kontakti idu sa njim. */
export const DELETE = createHandler(
  { auth: 'user', params: automationParamsSchema },
  async ({ viewer, params }) => {
    await deleteAutomation(assertViewer(viewer), params.id)
    return { deleted: true }
  },
)
