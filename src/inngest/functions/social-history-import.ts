import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import { importAccountHistory } from '@/services/social/history'

/** Uvoz do 100 objava po nalogu; jedan run po nalogu u isto vreme (ARCHITECTURE 6). */
export const socialHistoryImport = inngest.createFunction(
  {
    id: 'social-history-import',
    retries: 2,
    concurrency: [{ key: 'event.data.socialAccountId', limit: 1 }],
    triggers: [events.socialHistoryImportRequested],
  },
  async ({ event, step }) => step.run('import', () => importAccountHistory(event.data.socialAccountId, 100)),
)
