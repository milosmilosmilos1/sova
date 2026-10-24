import { NextResponse } from 'next/server'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { connectQuerySchema, providerParamSchema } from '@/lib/schemas/social'
import { beginSocialConnect } from '@/services/social/accounts'

/** Početak povezivanja mreže (facebook | instagram | meta): state u bazi, 302 na mrežu. */
export const GET = createHandler(
  { auth: 'verified', params: providerParamSchema, query: connectQuerySchema },
  async ({ viewer, params, query }) => {
    const url = await beginSocialConnect(
      assertViewer(viewer),
      params.provider,
      query.brandId,
      query.redirectTo ?? null,
    )
    return NextResponse.redirect(url, 302)
  },
)
