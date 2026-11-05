import { NextResponse } from 'next/server'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { figmaConnectQuerySchema } from '@/lib/schemas/figma'
import { beginFigmaConnect } from '@/services/figma/connection'

/** Počinje Figma prijavu (PKCE): pamti state i šalje korisnika na Figmu (D-161). */
export const GET = createHandler(
  { auth: 'verified', query: figmaConnectQuerySchema },
  async ({ viewer, query }) => {
    const url = await beginFigmaConnect(assertViewer(viewer), query.workspaceId, query.redirectTo ?? null)
    return NextResponse.redirect(url, 302)
  },
)
