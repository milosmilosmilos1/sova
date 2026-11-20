import { assertViewer, createHandler } from '@/lib/api/handler'
import { templateCreateSchema } from '@/lib/schemas/templates'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { createTemplatePost } from '@/services/templates'

export const maxDuration = 30

/** Nacrt iz šablona (D-175): slajdovi u stilu brenda i opis od upisanih podataka, bez tokena. */
export const POST = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    body: templateCreateSchema,
    rateLimit: { name: 'template-create', limit: 30, windowSec: 600, by: 'user' },
  },
  async ({ viewer, params, body }) => createTemplatePost(assertViewer(viewer), params.id, body),
)
