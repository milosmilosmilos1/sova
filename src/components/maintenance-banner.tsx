import { getTranslations } from 'next-intl/server'

import { getMaintenance } from '@/lib/maintenance'

/** Traka na vrhu svake strane kad admin uključi održavanje (brif 16); poruku admina ne prevodimo. */
export async function MaintenanceBanner() {
  const m = await getMaintenance()
  if (!m.enabled) return null
  const t = await getTranslations('appStatus')
  return (
    <div
      role="status"
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900"
    >
      {m.message || t('maintenance')}
    </div>
  )
}
