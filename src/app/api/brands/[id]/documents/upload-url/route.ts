import { assertViewer, createHandler } from '@/lib/api/handler'
import { documentUploadSchema } from '@/lib/schemas/setup'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { createDocumentUpload } from '@/services/brand-brain/documents'

/** Otpremanje PDF-a, korak 1: potpisan URL za PUT pravo u skladište (D-082, D-112). */
export const POST = createHandler(
  {
    auth: 'verified',
    params: uuidParamSchema,
    body: documentUploadSchema,
    rateLimit: { name: 'brand-documents-url', limit: 20, windowSec: 600, by: 'user' },
  },
  async ({ viewer, params, body }) => createDocumentUpload(assertViewer(viewer), params.id, body),
)
