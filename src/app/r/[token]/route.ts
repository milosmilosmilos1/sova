import { NextResponse, type NextRequest } from 'next/server'

import { env } from '@/lib/env'
import { recordClick } from '@/services/inbox/automations'

/** Link iz DM poruke (D-117): beleži klik i preusmerava na link toka; nepoznat link vodi na početnu. */
export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const url = await recordClick(token).catch(() => null)
  // na Netlify-u funkcija vidi adresu deploy-a, pa početna ide na javnu adresu aplikacije
  return NextResponse.redirect(url ?? new URL('/', env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin), {
    status: 302,
  })
}
