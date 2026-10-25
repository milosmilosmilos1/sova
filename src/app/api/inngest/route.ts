import { serve } from 'inngest/next'

import { inngest } from '@/inngest/client'
import { functions } from '@/inngest/functions'

/** Inngest koraci (Brand Brain, PDF izveštaj, otpremanje videa na mreže) traju duže od običnog zahteva. */
export const maxDuration = 300

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
})
