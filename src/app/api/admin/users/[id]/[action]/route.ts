import { ApiError } from '@/lib/api/errors'
import { assertViewer, createHandler } from '@/lib/api/handler'
import { adjustTokensSchema, banSchema, deleteUserSchema, userActionParamsSchema } from '@/lib/schemas/admin'
import { z } from 'zod'
import { adminContextFromRequest } from '@/services/admin/audit'
import {
  adjustTokens,
  banUser,
  deleteUserAccount,
  forceLogout,
  resendVerification,
  unbanUser,
} from '@/services/admin/users'

// telo se proverava po radnji (ispod), da poruka o grešci odgovara baš toj radnji
const body = z.looseObject({})

/**
 * Radnje nad korisnikom (brif 16): tokeni (+/− uz razlog), ban, unban, odjava sa svih uređaja,
 * ponovna verifikacija, brisanje uz potvrdu emaila. Samo platform admin sa MFA; sve u audit logu.
 */
export const POST = createHandler(
  {
    auth: 'admin',
    params: userActionParamsSchema,
    body,
    rateLimit: { name: 'admin-action', limit: 60, windowSec: 60, by: 'user' },
  },
  async ({ req, viewer, params, body: b, requestId }) => {
    const ctx = adminContextFromRequest(req, assertViewer(viewer), requestId)
    const parse = <T>(schema: z.ZodType<T>): T => {
      const r = schema.safeParse(b)
      if (!r.success) {
        throw new ApiError('VALIDATION', r.error.issues[0]?.message ?? 'Proverite unos.')
      }
      return r.data
    }
    switch (params.action) {
      case 'tokens':
        return adjustTokens(ctx, params.id, parse(adjustTokensSchema))
      case 'ban':
        await banUser(ctx, params.id, parse(banSchema).reason)
        return { banned: true }
      case 'unban':
        await unbanUser(ctx, params.id)
        return { banned: false }
      case 'logout':
        return forceLogout(ctx, params.id)
      case 'resend-verification':
        await resendVerification(ctx, params.id)
        return { sent: true }
      case 'delete':
        return deleteUserAccount(ctx, params.id, parse(deleteUserSchema).confirmEmail)
    }
  },
)
