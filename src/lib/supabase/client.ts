'use client'

import { createBrowserClient } from '@supabase/ssr'

import { assertPublicSupabaseEnv, publicEnv } from '@/lib/env.public'
import type { Database } from '@/types/database'

let browserSingleton: ReturnType<typeof createBrowserClient<Database>> | null = null

/** Supabase klijent u browseru (anon ključ + sesija korisnika). */
export function createSupabaseBrowserClient() {
  if (browserSingleton) return browserSingleton
  assertPublicSupabaseEnv()
  browserSingleton = createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey)
  return browserSingleton
}
