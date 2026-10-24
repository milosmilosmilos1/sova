import { assertViewer, createHandler } from '@/lib/api/handler'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { revokeApprovalLink } from '@/services/posts/approval-links'

export const DELETE = createHandler(
  { auth: 'verified', params: uuidParamSchema },
  async ({ viewer, params }) => {
    await revokeApprovalLink(assertViewer(viewer), params.id)
    return { revoked: true }
  },
)
