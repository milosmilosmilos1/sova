import { NextResponse } from 'next/server'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { env } from '@/lib/env'
import { figmaCallbackQuerySchema } from '@/lib/schemas/figma'
import { completeFigmaConnect } from '@/services/figma/connection'

/** Povratak iz Figme: state → tokeni → veza; preusmerenje nazad u aplikaciju (D-161). */
export const GET = createHandler(
  { auth: 'user', query: figmaCallbackQuerySchema },
  async ({ viewer, query }) => {
    const r = await completeFigmaConnect(assertViewer(viewer), {
      state: query.state ?? null,
      code: query.code ?? null,
      error: query.error ?? null,
    })
    return NextResponse.redirect(new URL(r.redirectTo, env.NEXT_PUBLIC_APP_URL), 302)
  },
)
