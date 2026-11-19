import { assertViewer, createHandler } from '@/lib/api/handler'
import { supportEscalateSchema } from '@/lib/schemas/support'
import { escalateSupportConversation } from '@/services/support/chat'

/** „Pošalji podršci” (D-172): razgovor postaje prijava problema na tabli predloga, jednom po razgovoru. */
export const POST = createHandler(
  {
    auth: 'user',
    body: supportEscalateSchema,
    rateLimit: { name: 'support-escalate', limit: 10, windowSec: 3600, by: 'user' },
  },
  async ({ viewer, body }) => escalateSupportConversation(assertViewer(viewer), body.conversationId),
)
