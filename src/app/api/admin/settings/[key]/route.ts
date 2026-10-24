import { z } from 'zod'

import { ApiError } from '@/lib/api/errors'
import { assertViewer, createHandler } from '@/lib/api/handler'
import {
  maintenanceBodySchema,
  modelsBodySchema,
  settingParamsSchema,
  tokenPricesBodySchema,
} from '@/lib/schemas/admin'
import { adminContextFromRequest } from '@/services/admin/audit'
import { updateActiveModels, updateMaintenance, updateTokenPrices } from '@/services/admin/platform'

// telo se proverava po ključu (ispod), da poruka o grešci odgovara baš tom podešavanju
const body = z.looseObject({})

/** Podešavanja platforme: cene tokena, aktivni modeli iz dozvoljene liste, banner za održavanje. */
export const PUT = createHandler(
  {
    auth: 'admin',
    params: settingParamsSchema,
    body,
    rateLimit: { name: 'admin-action', limit: 60, windowSec: 60, by: 'user' },
  },
  async ({ req, viewer, params, body: b, requestId }) => {
    const ctx = adminContextFromRequest(req, assertViewer(viewer), requestId)
    const parse = <T>(schema: z.ZodType<T>): T => {
      const r = schema.safeParse(b)
      if (!r.success) throw new ApiError('VALIDATION', r.error.issues[0]?.message ?? 'Proverite unos.')
      return r.data
    }
    switch (params.key) {
      case 'token-prices':
        return { tokenPrices: await updateTokenPrices(ctx, parse(tokenPricesBodySchema).prices) }
      case 'models':
        return { activeModels: await updateActiveModels(ctx, parse(modelsBodySchema).models) }
      case 'maintenance':
        return { maintenance: await updateMaintenance(ctx, parse(maintenanceBodySchema)) }
    }
  },
)
