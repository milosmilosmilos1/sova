import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { events } from '@/inngest/events'
import { runBillingDaily } from '@/services/billing/daily'
import { processPaymentEvent } from '@/services/billing/events'

/**
 * Stripe događaj iz webhook-a (D-090): obrada je idempotentna po `payment_events.id`; Stripe ne
 * odgovara ili baza pada → Inngest ponavlja, trajna greška ostaje `failed` za ručnu proveru.
 */
export const billingProcessEvent = inngest.createFunction(
  {
    id: 'billing-process-event',
    retries: 5,
    concurrency: [{ key: 'event.data.paymentEventId', limit: 1 }],
    triggers: [events.billingWebhookReceived],
  },
  async ({ event, step }) => step.run('process', () => processPaymentEvent(event.data.paymentEventId)),
)

/** Svaki dan u 04:15: mesečni tokeni godišnjeg plana, podsetnici za plaćanje, istekle rezervacije i grantovi. */
export const billingDaily = inngest.createFunction(
  { id: 'billing-daily', retries: 2, triggers: [cron('15 4 * * *')] },
  async ({ step }) => step.run('billing-daily', () => runBillingDaily()),
)
