import 'server-only'

import { swrCache } from '@/lib/cache/swr'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * Banner za održavanje (brif 16 „Platforma”): javno podešavanje `maintenance`. Drži se 60 s, a posle
 * toga se vraća poslednje stanje (najviše 5 min staro) dok se novo čita u pozadini (D-164), jer ga
 * čita svaka strana.
 */
export interface MaintenanceState {
  enabled: boolean
  message: string
}

const OFF: MaintenanceState = { enabled: false, message: '' }

const maintenance = swrCache<MaintenanceState>(
  async () => {
    const { data, error } = await createSupabaseAdminClient()
      .from('platform_settings')
      .select('value')
      .eq('key', 'maintenance')
      .maybeSingle()
    if (error) throw error
    const v = (data?.value ?? {}) as { enabled?: unknown; message?: unknown }
    return { enabled: v.enabled === true, message: typeof v.message === 'string' ? v.message : '' }
  },
  {
    freshMs: 60_000,
    maxStaleMs: 5 * 60_000,
    fallback: () => OFF,
    errorTtlMs: 60_000,
    onError: (error) => logger.warn('maintenance_load_failed', { error }),
  },
)

export function getMaintenance(): Promise<MaintenanceState> {
  return maintenance.get()
}

export function clearMaintenanceCache(): void {
  maintenance.clear()
}
