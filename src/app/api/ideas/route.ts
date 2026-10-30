import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { ideaCreateSchema, ideasQuerySchema } from '@/lib/schemas/ideas'
import { createIdea, listIdeas } from '@/services/ideas'

/** Tabla predloga (D-115): ideje svih korisnika i sopstvene prijave problema. */
export const GET = createHandler({ auth: 'user', query: ideasQuerySchema }, async ({ viewer, query }) =>
  listIdeas(assertViewer(viewer), query),
)

export const POST = createHandler(
  {
    auth: 'verified',
    body: ideaCreateSchema,
    rateLimit: { name: 'ideas-create', limit: 5, windowSec: 3600, by: 'user' },
  },
  async ({ viewer, body, requestId }) =>
    jsonOk(await createIdea(assertViewer(viewer), body), requestId, { status: 201 }),
)
