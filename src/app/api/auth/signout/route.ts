import { NextResponse } from 'next/server'

import { createHandler } from '@/lib/api/handler'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/** Odjava radi i sa isteklom sesijom; zato auth: 'none'. */
export const POST = createHandler({ auth: 'none' }, async ({ req }) => {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  const wantsJson = req.headers.get('accept')?.includes('application/json')
  if (wantsJson) return { signedOut: true }
  return NextResponse.redirect(new URL('/login', req.nextUrl.origin), { status: 303 })
})
