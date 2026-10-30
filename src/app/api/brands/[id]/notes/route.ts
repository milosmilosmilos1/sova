import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { noteCreateSchema } from '@/lib/schemas/setup'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { createNote } from '@/services/brand-brain/documents'

/** Beleška o brendu (D-113): ručni izvor za bazu znanja; 202 jer se pamti u pozadini. Briše se kao dokument. */
export const POST = createHandler(
  {
    auth: 'verified',
    params: uuidParamSchema,
    body: noteCreateSchema,
    rateLimit: { name: 'brand-notes', limit: 20, windowSec: 600, by: 'user' },
  },
  async ({ viewer, params, body, requestId }) =>
    jsonOk(await createNote(assertViewer(viewer), params.id, body), requestId, { status: 202 }),
)
