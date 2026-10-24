import { NextResponse } from 'next/server'
import { z } from 'zod'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { env } from '@/lib/env'
import { completeCanvaConnect } from '@/services/canva/connection'

const query = z.object({
  state: z.string().max(200).optional(),
  code: z.string().max(2000).optional(),
  error: z.string().max(200).optional(),
})

/** Povratak iz Canve: state → tokeni → veza; preusmerenje nazad u aplikaciju. */
export const GET = createHandler({ auth: 'user', query }, async ({ viewer, query: q }) => {
  const r = await completeCanvaConnect(assertViewer(viewer), {
    state: q.state ?? null,
    code: q.code ?? null,
    error: q.error ?? null,
  })
  return NextResponse.redirect(new URL(r.redirectTo, env.NEXT_PUBLIC_APP_URL), 302)
})
