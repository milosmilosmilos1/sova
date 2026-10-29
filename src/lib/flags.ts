import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/** AI slike kroz Gemini (D-104): podrazumevano isključene, admin ih uključuje bez deploya. */
export const AI_IMAGES_FLAG = 'ai_images'

/** Feature flagovi iz tabele `feature_flags` (admin ih menja bez deploya), keš 60 s. */
const TTL = 60_000
const cache = new Map<string, { value: boolean; expires: number }>()
const overrides = new Map<string, boolean>()

export async function isFeatureEnabled(key: string): Promise<boolean> {
  const o = overrides.get(key)
  if (o !== undefined) return o
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.value
  const admin = createSupabaseAdminClient()
  const { data } = await admin.from('feature_flags').select('enabled').eq('key', key).maybeSingle()
  const value = Boolean(data?.enabled)
  cache.set(key, { value, expires: Date.now() + TTL })
  return value
}

export function setFeatureFlagForTests(key: string, value: boolean | null): void {
  if (value === null) overrides.delete(key)
  else overrides.set(key, value)
  cache.delete(key)
}

/** Posle izmene u admin panelu: sledeće čitanje ide u bazu. */
export function clearFlagCache(): void {
  cache.clear()
}
