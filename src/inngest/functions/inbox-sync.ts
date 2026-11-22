import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { logger } from '@/lib/logger'
import { loadAccountRow } from '@/services/social/account-rows'
import { syncAccountAndAutomate } from '@/services/inbox/threads'
import { inboxAccountsToSync } from '@/services/inbox/sync'

/** Naloga u jednom koraku: sinhronizacija jednog traje 1 do 5 s, pa grupa staje u jedan zahtev. */
const CHUNK = 4

/**
 * Inbox (D-117): komentari, poruke i recenzije povezanih naloga, pa DM automatizacija za nove
 * komentare sa ključnom reči i podsetnici. Radi samo dok je prekidač `inbox` uključen (za sve ili za
 * radne prostore iz `rollout.workspaces`). Na sat, ne na 10 min (D-191): dugme „Osveži Inbox” radi
 * odmah i bez Inngest-a. Bez naloga prolaz je jedno izvršavanje; nalozi idu u grupama po četiri
 * (sortirani, pa je grupa ista pri ponovljenom pozivu), a greška jednog ne prekida ostale.
 */
export const inboxSync = inngest.createFunction(
  { id: 'inbox-sync', retries: 1, concurrency: { limit: 1 }, triggers: [cron('20 * * * *')] },
  async ({ step }) => {
    const ids = [...(await inboxAccountsToSync())].sort()
    if (!ids.length) return { accounts: 0, dms: 0 }
    let dms = 0
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      dms += await step.run(`accounts-${chunk[0]}`, async () => {
        let n = 0
        for (const id of chunk) {
          try {
            const row = await loadAccountRow(id)
            if (row) n += (await syncAccountAndAutomate(row)).dms
          } catch (error) {
            logger.warn('inbox_sync_account_failed', { accountId: id, error })
          }
        }
        return n
      })
    }
    return { accounts: ids.length, dms }
  },
)
