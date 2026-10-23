import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { env } from '@/lib/env'
import type { Database } from '@/types/database'

let adminSingleton: SupabaseClient<Database> | null = null

/**
 * JEDINO mesto gde se koristi service role ključ. Zaobilazi RLS.
 * Koristi se iz Inngest funkcija, webhook-ova i admin rutа, nikad iz klijenta.
 */
export function createSupabaseAdminClient(): SupabaseClient<Database> {
  if (adminSingleton) return adminSingleton
  adminSingleton = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-sova-client': 'admin' } },
  })
  return adminSingleton
}
