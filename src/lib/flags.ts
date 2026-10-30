import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/** AI slike kroz Gemini (D-104): podrazumevano isključene, admin ih uključuje bez deploya. */
export const AI_IMAGES_FLAG = 'ai_images'
/** Inbox i DM automatizacija (D-117): dok Meta ne odobri dozvole za poruke i komentare. */
export const INBOX_FLAG = 'inbox'

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

/**
 * Prekidač za jedan radni prostor: uključen za sve ili samo za prostore iz `rollout.workspaces`
 * (npr. vlasnik proba Inbox na svom nalogu pre odobrenja Mete). Keš 60 s kao `isFeatureEnabled`.
 */
const rolloutCache = new Map<string, { value: string[]; expires: number }>()

export async function isFeatureEnabledFor(key: string, workspaceId: string): Promise<boolean> {
  if (await isFeatureEnabled(key)) return true
  if (overrides.has(key)) return false
  return (await rolloutWorkspaces(key)).includes(workspaceId)
}

/** Radni prostori iz `rollout.workspaces` (bez globalnog uključenja). */
export async function rolloutWorkspaces(key: string): Promise<string[]> {
  // prekidač postavljen u testu važi i za rollout
  if (overrides.has(key)) return []
  const hit = rolloutCache.get(key)
  if (hit && hit.expires > Date.now()) return hit.value
  const { data } = await createSupabaseAdminClient()
    .from('feature_flags')
    .select('rollout')
    .eq('key', key)
    .maybeSingle()
  const raw = (data?.rollout as { workspaces?: unknown } | null)?.workspaces
  const value = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  rolloutCache.set(key, { value, expires: Date.now() + TTL })
  return value
}

export function setFeatureFlagForTests(key: string, value: boolean | null): void {
  if (value === null) overrides.delete(key)
  else overrides.set(key, value)
  cache.delete(key)
  rolloutCache.delete(key)
}

/** Posle izmene u admin panelu: sledeće čitanje ide u bazu. */
export function clearFlagCache(): void {
  cache.clear()
  rolloutCache.clear()
}
