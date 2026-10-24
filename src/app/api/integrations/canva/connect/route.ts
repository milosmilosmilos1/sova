import { NextResponse } from 'next/server'
import { z } from 'zod'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { beginCanvaConnect } from '@/services/canva/connection'

const query = z.object({
  workspaceId: z.uuid(),
  redirectTo: z.string().max(200).optional(),
})

/** Počinje Canva OAuth (PKCE): pamti state i preusmerava korisnika na Canvu. */
export const GET = createHandler({ auth: 'verified', query }, async ({ viewer, query: q }) => {
  const url = await beginCanvaConnect(assertViewer(viewer), q.workspaceId, q.redirectTo ?? null)
  return NextResponse.redirect(url, 302)
})
