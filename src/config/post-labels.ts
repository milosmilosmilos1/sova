import type { Database } from '@/types/database'

type TargetStatus = Database['public']['Enums']['target_status']

/** Oznake statusa targeta za UI (client-safe, bez server zavisnosti). */
export const TARGET_STATUS_LABEL: Record<TargetStatus, string> = {
  pending: 'čeka',
  scheduled: 'zakazano',
  paused: 'pauzirano',
  needs_reauth: 'traži ponovno povezivanje',
  publishing: 'objavljuje se',
  published: 'objavljeno',
  failed: 'neuspelo',
  canceled: 'otkazano',
  deleted_externally: 'obrisano na mreži',
  assisted_pending: 'čeka ručno objavljivanje',
  assisted_done: 'ručno objavljeno',
}

export function targetStatusLabel(status: string): string {
  return (TARGET_STATUS_LABEL as Record<string, string>)[status] ?? status
}
