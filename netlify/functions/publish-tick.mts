/**
 * Netlify zakazana funkcija (D-193): na 2 minuta poziva krug objava u Sovi. Radi samo na objavljenom
 * produkcionom deploy-u; lokalno i u pregledima ne radi. Tajna je CRON_SECRET iz Netlify okruženja.
 */
export default async function publishTick(): Promise<Response> {
  const base = process.env.URL
  const secret = process.env.CRON_SECRET
  if (!base || !secret) return new Response('nije podešeno', { status: 500 })
  const res = await fetch(`${base}/api/cron/publish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(28_000),
  })
  return new Response(null, { status: res.ok ? 204 : 502 })
}

export const config = { schedule: '*/2 * * * *' }
