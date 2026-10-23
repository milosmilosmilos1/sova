import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import { runImageGeneration } from '@/services/ai/image'

/**
 * Generisanje slike kao pozadinski posao (brif 6.4: slike uvek u pozadini).
 * Sama služba radi retry/fallback ka modelima i oslobađa tokene pri neuspehu;
 * Inngest retry pokriva pad procesa (posao je idempotentan po generationId).
 */
export const aiGenerateImage = inngest.createFunction(
  {
    id: 'ai-generate-image',
    retries: 2,
    concurrency: [{ key: 'event.data.workspaceId', limit: 2 }],
    triggers: [events.aiImageRequested],
  },
  async ({ event, step }) => {
    return step.run('generate', () => runImageGeneration(event.data.generationId))
  },
)
