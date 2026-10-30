import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { documentCompleteSchema } from '@/lib/schemas/setup'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { completeDocument, listDocuments } from '@/services/brand-brain/documents'

/** Dokumenti o brendu (D-112), najnoviji prvi; „processing” dok pozadinski posao čita tekst. */
export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  listDocuments(assertViewer(viewer), params.id),
)

/** Otpremanje, korak 2: provera PDF-a i pozadinsko čitanje; 202 jer tekst stiže kasnije. */
export const POST = createHandler(
  {
    auth: 'verified',
    params: uuidParamSchema,
    body: documentCompleteSchema,
    rateLimit: { name: 'brand-documents', limit: 10, windowSec: 600, by: 'user' },
  },
  async ({ viewer, params, body, requestId }) =>
    jsonOk(await completeDocument(assertViewer(viewer), params.id, body), requestId, { status: 202 }),
)
