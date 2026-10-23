import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'

/** Probna funkcija: potvrđuje da Inngest dev server vidi aplikaciju. */
export const ping = inngest.createFunction(
  { id: 'ping', retries: 0, triggers: [events.ping] },
  async ({ event, step }) => {
    const echoed = await step.run('echo', async () => ({
      message: event.data.message,
      at: new Date().toISOString(),
    }))
    return echoed
  },
)
