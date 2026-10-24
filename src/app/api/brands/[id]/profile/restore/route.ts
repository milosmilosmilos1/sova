import { assertViewer, createHandler } from '@/lib/api/handler'
import { restoreProfileSchema } from '@/lib/schemas/brand'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { restoreProfileVersion } from '@/services/brand-brain/profile'

/** Vraćanje starije verzije profila (kopira se kao nova verzija). */
export const POST = createHandler(
  { auth: 'verified', params: uuidParamSchema, body: restoreProfileSchema },
  async ({ viewer, params, body }) => restoreProfileVersion(assertViewer(viewer), params.id, body.version),
)
