import 'server-only'

import { swrCache } from '@/lib/cache/swr'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/** AI slike kroz Gemini (D-104): podrazumevano isključene, admin ih uključuje bez deploya. */
export const AI_IMAGES_FLAG = 'ai_images'
/** Inbox i DM automatizacija (D-117): dok Meta ne odobri dozvole za poruke i komentare. */
export const INBOX_FLAG = 'inbox'

interface FlagState {
  enabled: boolean
  /** `rollout.workspaces`: prostori kojima je prekidač uključen i kad je globalno isključen */
  workspaces: string[]
}

function rolloutOf(rollout: unknown): string[] {
  const raw = (rollout as { workspaces?: unknown } | null)?.workspaces
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
}

/**
 * Feature flagovi iz tabele `feature_flags` (admin ih menja bez deploya). Svi se čitaju jednim upitom
 * i drže 60 s, a posle toga se vraća poslednje stanje dok se novo čita u pozadini (D-164). Ranije je
 * svaki ključ išao posebno, pa je lista naloga čekala i do osam upita zaredom.
 */
const flags = swrCache<Map<string, FlagState>>(
  async () => {
    const { data, error } = await createSupabaseAdminClient()
      .from('feature_flags')
      .select('key, enabled, rollout')
    if (error) throw error
    return new Map(
      (data ?? []).map((row) => [
        row.key,
        { enabled: Boolean(row.enabled), workspaces: rolloutOf(row.rollout) },
      ]),
    )
  },
  {
    freshMs: 60_000,
    maxStaleMs: 15 * 60_000,
    // kao ranije: bez baze je svaki prekidač isključen
    fallback: () => new Map(),
    errorTtlMs: 10_000,
    onError: (error) => logger.warn('feature_flags_load_failed', { error }),
  },
)

const overrides = new Map<string, boolean>()

export async function isFeatureEnabled(key: string): Promise<boolean> {
  const o = overrides.get(key)
  if (o !== undefined) return o
  return (await flags.get()).get(key)?.enabled ?? false
}

/**
 * Prekidač za jedan radni prostor: uključen za sve ili samo za prostore iz `rollout.workspaces`
 * (npr. vlasnik proba Inbox na svom nalogu pre odobrenja Mete).
 */
export async function isFeatureEnabledFor(key: string, workspaceId: string): Promise<boolean> {
  if (await isFeatureEnabled(key)) return true
  if (overrides.has(key)) return false
  return (await rolloutWorkspaces(key)).includes(workspaceId)
}

/** Radni prostori iz `rollout.workspaces` (bez globalnog uključenja). */
export async function rolloutWorkspaces(key: string): Promise<string[]> {
  // prekidač postavljen u testu važi i za rollout
  if (overrides.has(key)) return []
  return (await flags.get()).get(key)?.workspaces ?? []
}

export function setFeatureFlagForTests(key: string, value: boolean | null): void {
  if (value === null) overrides.delete(key)
  else overrides.set(key, value)
  flags.clear()
}

/** Posle izmene u admin panelu: sledeće čitanje ide u bazu. */
export function clearFlagCache(): void {
  flags.clear()
}
