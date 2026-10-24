import { z } from 'zod'

import { createHandler } from '@/lib/api/handler'
import { publicCommentSchema, publicDecisionSchema, tokenParamSchema } from '@/lib/schemas/posts'
import { commentViaLink, decideViaLink, getPublicApproval } from '@/services/posts/approval-links'

/** Javno odobravanje bez naloga: čitanje objava sa linka (30/min po IP-u). */
export const GET = createHandler(
  {
    auth: 'none',
    params: tokenParamSchema,
    rateLimit: { name: 'public-approval', limit: 30, windowSec: 60, by: 'ip' },
  },
  async ({ params }) => getPublicApproval(params.token),
)

const body = z.discriminatedUnion('kind', [
  publicDecisionSchema.extend({ kind: z.literal('decision') }),
  publicCommentSchema.extend({ kind: z.literal('comment') }),
])

/** Odluka ili komentar klijenta preko javnog linka. */
export const POST = createHandler(
  {
    auth: 'none',
    params: tokenParamSchema,
    body,
    rateLimit: { name: 'public-approval', limit: 30, windowSec: 60, by: 'ip' },
  },
  async ({ params, body: b }) =>
    b.kind === 'decision'
      ? decideViaLink(params.token, {
          postId: b.postId,
          postVersion: b.postVersion,
          decision: b.decision,
          comment: b.comment ?? null,
          name: b.name ?? null,
        })
      : commentViaLink(params.token, { postId: b.postId, body: b.body, name: b.name ?? null }),
)
