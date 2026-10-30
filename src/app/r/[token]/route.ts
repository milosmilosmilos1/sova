import { NextResponse, type NextRequest } from 'next/server'

import { recordClick } from '@/services/inbox/automations'

/** Link iz DM poruke (D-117): beleži klik i preusmerava na link toka; nepoznat link vodi na početnu. */
export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const url = await recordClick(token).catch(() => null)
  return NextResponse.redirect(url ?? new URL('/', request.url), { status: 302 })
}
