import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import { runVisualTemplate } from '@/services/visuals/template'

/** Vizual iz šablona u pozadini (Unsplash + rangiranje + Satori render); idempotentno po generationId. */
export const aiVisualTemplate = inngest.createFunction(
  {
    id: 'ai-visual-template',
    retries: 2,
    concurrency: [{ key: 'event.data.workspaceId', limit: 2 }],
    triggers: [events.aiVisualTemplateRequested],
  },
  async ({ event, step }) => step.run('render', () => runVisualTemplate(event.data.generationId)),
)
