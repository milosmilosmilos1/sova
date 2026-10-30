import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { loadAccountRow } from '@/services/social/account-rows'
import { syncAccountAndAutomate } from '@/services/inbox/threads'
import { inboxAccountsToSync } from '@/services/inbox/sync'

/**
 * Na 10 minuta (D-117): komentari, poruke i recenzije povezanih naloga u Inbox, pa DM automatizacija
 * za nove komentare sa ključnom reči i podsetnici. Radi samo dok je prekidač `inbox` uključen (za sve
 * ili za radne prostore iz `rollout.workspaces`). Svaki nalog je svoj korak, pa greška jednog ne
 * zaustavlja ostale.
 */
export const inboxSync = inngest.createFunction(
  { id: 'inbox-sync', retries: 1, concurrency: { limit: 1 }, triggers: [cron('*/10 * * * *')] },
  async ({ step }) => {
    const ids = await step.run('accounts', () => inboxAccountsToSync())
    let dms = 0
    for (const id of ids) {
      const out = await step.run(`account-${id}`, async () => {
        const row = await loadAccountRow(id)
        return row ? syncAccountAndAutomate(row) : { threads: 0, inserted: 0, dms: 0, errors: [] }
      })
      dms += out.dms
    }
    return { accounts: ids.length, dms }
  },
)
