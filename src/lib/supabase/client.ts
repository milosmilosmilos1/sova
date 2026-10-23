'use client'

import { createBrowserClient } from '@supabase/ssr'

import { assertPublicSupabaseEnv, publicEnv } from '@/lib/env.public'

let browserSingleton: ReturnType<typeof createBrowserClient> | null = null

/** Supabase klijent u browseru (anon ključ + sesija korisnika). */
export function createSupabaseBrowserClient() {
  if (browserSingleton) return browserSingleton
  assertPublicSupabaseEnv()
  browserSingleton = createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey)
  return browserSingleton
}
