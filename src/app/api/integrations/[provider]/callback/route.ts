import { NextResponse } from 'next/server'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { env } from '@/lib/env'
import { callbackQuerySchema, providerParamSchema } from '@/lib/schemas/social'
import { completeSocialConnect } from '@/services/social/accounts'

/** Povratak sa mreže: state → tokeni → nalozi na čekanju → ekran za izbor. */
export const GET = createHandler(
  { auth: 'user', params: providerParamSchema, query: callbackQuerySchema },
  async ({ viewer, params, query }) => {
    const r = await completeSocialConnect(assertViewer(viewer), params.provider, {
      state: query.state ?? null,
      code: query.code ?? null,
      error: query.error ?? query.error_reason ?? null,
      errorDescription: query.error_description ?? null,
    })
    return NextResponse.redirect(new URL(r.redirectTo, env.NEXT_PUBLIC_APP_URL), 302)
  },
)
