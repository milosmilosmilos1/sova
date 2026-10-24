import { getMaintenance } from '@/lib/maintenance'

/** Traka na vrhu svake strane kad admin uključi održavanje (brif 16). */
export async function MaintenanceBanner() {
  const m = await getMaintenance()
  if (!m.enabled) return null
  return (
    <div
      role="status"
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900"
    >
      {m.message || 'Sova je trenutno na održavanju. Neke funkcije mogu privremeno da ne rade.'}
    </div>
  )
}
