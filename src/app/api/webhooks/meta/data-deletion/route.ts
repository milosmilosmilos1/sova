import { NextResponse } from 'next/server'

import { createHandler } from '@/lib/api/handler'
import { handleMetaDataDeletion } from '@/services/social/webhooks'

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

/**
 * Meta data deletion callback: odgovor mora biti čist JSON `{ url, confirmation_code }`
 * (bez našeg `ok/data` omotača), zato vraćamo Response direktno.
 */
export const POST = createHandler(
  { auth: 'none', rateLimit: { name: 'webhook-meta', limit: 120, windowSec: 60, by: 'ip' } },
  async ({ req }) => {
    const r = await handleMetaDataDeletion(await signedRequestFrom(req))
    return NextResponse.json(r)
  },
)
