import { createHandler } from '@/lib/api/handler'
import { handleMetaDeauthorize } from '@/services/social/webhooks'

async function signedRequestFrom(req: Request): Promise<string | null> {
  const type = req.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    const body = (await req.json().catch(() => null)) as { signed_request?: string } | null
    return body?.signed_request ?? null
  }
  const form = await req.formData().catch(() => null)
  const v = form?.get('signed_request')
  return typeof v === 'string' ? v : null
}

/** Meta deauthorize callback: korisnik je uklonio Sovu → nalozi tog korisnika postaju `revoked`. */
export const POST = createHandler(
  { auth: 'none', rateLimit: { name: 'webhook-meta', limit: 120, windowSec: 60, by: 'ip' } },
  async ({ req }) => handleMetaDeauthorize(await signedRequestFrom(req)),
)
