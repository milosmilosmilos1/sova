import { z } from 'zod'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { createApprovalLinkSchema } from '@/lib/schemas/posts'
import { createApprovalLink, listApprovalLinks } from '@/services/posts/approval-links'

export const GET = createHandler(
  { auth: 'user', query: z.object({ brandId: z.uuid() }) },
  async ({ viewer, query }) => listApprovalLinks(assertViewer(viewer), query.brandId),
)

/** Javni link za odobravanje: token se vraća samo jednom (u bazi je hash). */
export const POST = createHandler(
  { auth: 'verified', body: createApprovalLinkSchema },
  async ({ viewer, body, requestId }) =>
    jsonOk(await createApprovalLink(assertViewer(viewer), body), requestId, { status: 201 }),
)
