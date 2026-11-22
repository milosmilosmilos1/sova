import { createHandler } from '@/lib/api/handler'
import { handleTikTokWebhook } from '@/services/social/webhooks'

/**
 * TikTok webhook (adresa se upisuje u TikTok Developer Portal → Webhooks): sirovo telo za proveru
 * potpisa; `authorization.removed` briše naloge tog TikTok korisnika (D-188).
 */
export const POST = createHandler(
  { auth: 'none', rateLimit: { name: 'webhook-tiktok', limit: 120, windowSec: 60, by: 'ip' } },
  async ({ req }) => handleTikTokWebhook(await req.text(), req.headers.get('tiktok-signature')),
)
