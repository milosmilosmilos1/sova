import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import { runStrategyGeneration } from '@/services/strategy/strategy'

/**
 * Strategija sadržaja u pozadini (20 tokena, do 2 min): jedan run po brendu u isto vreme.
 * Servis sam radi fallback modela i oslobađa tokene pri neuspehu; Inngest retry pokriva pad procesa.
 */
export const aiGenerateStrategy = inngest.createFunction(
  {
    id: 'ai-generate-strategy',
    retries: 2,
    concurrency: [{ key: 'event.data.brandId', limit: 1 }],
    triggers: [events.strategyGenerateRequested],
  },
  async ({ event, step }) => step.run('generate', () => runStrategyGeneration(event.data.generationId)),
)
