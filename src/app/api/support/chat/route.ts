import { assertViewer, createHandler } from '@/lib/api/handler'
import { supportMessageSchema, supportThreadQuerySchema } from '@/lib/schemas/support'
import { getSupportThread, sendSupportMessage } from '@/services/support/chat'

/** Chatbot podrške (D-172): poslednji razgovor korisnika (ili zadati) za prozor „Vodič i podrška”. */
export const GET = createHandler(
  { auth: 'user', query: supportThreadQuerySchema },
  async ({ viewer, query }) => getSupportThread(assertViewer(viewer), query.conversationId),
)

/**
 * Pitanje chatbotu: besplatno. Granica od 20 pitanja na sat po korisniku se broji i iz baze, jer
 * ograničenje u memoriji važi samo za jedan server.
 */
export const POST = createHandler(
  {
    auth: 'user',
    body: supportMessageSchema,
    rateLimit: { name: 'support-chat', limit: 20, windowSec: 3600, by: 'user' },
  },
  async ({ viewer, body, requestId }) => sendSupportMessage(assertViewer(viewer), body, { requestId }),
)
