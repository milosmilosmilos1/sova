import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { env } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Supabase klijent za Server Components, Route Handlers i Server Actions.
 * Radi sa pravima prijavljenog korisnika (RLS). Nov klijent po zahtevu.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
        } catch {
          // Server Component ne može da piše cookie-je; proxy.ts osvežava sesiju.
        }
      },
    },
  })
}
