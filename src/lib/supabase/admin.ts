import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { env } from '@/lib/env'

let adminSingleton: SupabaseClient | null = null

/**
 * JEDINO mesto gde se koristi service role ključ. Zaobilazi RLS.
 * Koristi se iz Inngest funkcija, webhook-ova i admin rutа, nikad iz klijenta.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  if (adminSingleton) return adminSingleton
  adminSingleton = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-sova-client': 'admin' } },
  })
  return adminSingleton
}
