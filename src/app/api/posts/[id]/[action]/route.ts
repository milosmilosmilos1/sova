import { z } from 'zod'

import { ApiError } from '@/lib/api/errors'
import { assertViewer, createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { scheduleSchema, versionBodySchema } from '@/lib/schemas/posts'
import { duplicatePost } from '@/services/posts/posts'
import {
  cancelPost,
  decidePost,
  pausePost,
  publishNow,
  restorePost,
  resumePost,
  schedulePost,
  submitForReview,
  unschedulePost,
  validatePostContent,
  withdrawFromReview,
} from '@/services/posts/workflow'

const ACTIONS = [
  'submit',
  'withdraw',
  'approve',
  'reject',
  'request-changes',
  'schedule',
  'publish-now',
  'unschedule',
  'pause',
  'resume',
  'cancel',
  'restore',
  'duplicate',
  'validate',
] as const

const params = z.object({ id: z.uuid({ error: 'Neispravan identifikator.' }), action: z.enum(ACTIONS) })
const body = z.union([scheduleSchema, versionBodySchema, z.object({}).passthrough()])

/**
 * Radnje state machine-a nad objavom (ARCHITECTURE 7): telo nosi `version` (409 na zastarelu),
 * `comment` za odluke i `scheduledFor` za zakazivanje. Uloge proverava `checkAction`.
 */
export const POST = createHandler(
  { auth: 'verified', params, body },
  async ({ viewer, params: p, body: b, requestId }) => {
    const v = assertViewer(viewer)
    const version =
      typeof (b as { version?: unknown }).version === 'number' ? (b as { version: number }).version : null
    const comment =
      typeof (b as { comment?: unknown }).comment === 'string'
        ? ((b as { comment: string }).comment ?? null)
        : null
    const needVersion = () => {
      if (version === null)
        throw new ApiError('VALIDATION', 'Nedostaje version u telu zahteva.', {
          fields: { version: ['obavezno'] },
        })
      return version
    }
    switch (p.action) {
      case 'submit':
        return submitForReview(v, p.id, needVersion())
      case 'withdraw':
        return withdrawFromReview(v, p.id, needVersion())
      case 'approve':
        return decidePost(v, p.id, needVersion(), 'approved', comment)
      case 'reject':
        return decidePost(v, p.id, needVersion(), 'rejected', comment)
      case 'request-changes':
        return decidePost(v, p.id, needVersion(), 'changes_requested', comment)
      case 'schedule': {
        const parsed = scheduleSchema.safeParse(b)
        if (!parsed.success)
          throw new ApiError('VALIDATION', 'Za zakazivanje treba version i scheduledFor.', {
            fields: { scheduledFor: ['obavezno'] },
          })
        return schedulePost(v, p.id, parsed.data)
      }
      case 'publish-now':
        return publishNow(v, p.id, needVersion())
      case 'unschedule':
        return unschedulePost(v, p.id, needVersion())
      case 'pause':
        return pausePost(v, p.id, needVersion())
      case 'resume':
        return resumePost(v, p.id, needVersion())
      case 'cancel':
        return cancelPost(v, p.id, needVersion())
      case 'restore':
        return restorePost(v, p.id, needVersion())
      case 'duplicate':
        return jsonOk(await duplicatePost(v, p.id), requestId, { status: 201 })
      case 'validate':
        return validatePostContent(v, p.id)
    }
  },
)
