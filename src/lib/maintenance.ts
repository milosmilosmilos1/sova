import 'server-only'

import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/** Banner za održavanje (brif 16 „Platforma”): javno podešavanje `maintenance`, keš 60 s. */
export interface MaintenanceState {
  enabled: boolean
  message: string
}

const TTL = 60_000
let cache: { value: MaintenanceState; at: number } | null = null

export async function getMaintenance(): Promise<MaintenanceState> {
  if (cache && Date.now() - cache.at < TTL) return cache.value
  let value: MaintenanceState = { enabled: false, message: '' }
  try {
    const { data } = await createSupabaseAdminClient()
      .from('platform_settings')
      .select('value')
      .eq('key', 'maintenance')
      .maybeSingle()
    const v = (data?.value ?? {}) as { enabled?: unknown; message?: unknown }
    value = { enabled: v.enabled === true, message: typeof v.message === 'string' ? v.message : '' }
  } catch (error) {
    logger.warn('maintenance_load_failed', { error })
  }
  cache = { value, at: Date.now() }
  return value
}

export function clearMaintenanceCache(): void {
  cache = null
}
