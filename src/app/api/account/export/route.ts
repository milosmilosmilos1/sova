import { assertViewer, createHandler } from '@/lib/api/handler'
import { exportAccountData } from '@/services/account'

/** Izvoz podataka naloga u JSON (GDPR, pravo na prenosivost); preuzima se kao fajl. */
export const GET = createHandler(
  { auth: 'user', rateLimit: { name: 'account-export', limit: 3, windowSec: 3600, by: 'user' } },
  async ({ viewer }) => {
    const data = await exportAccountData(assertViewer(viewer))
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="sova-podaci-${day}.json"`,
        'cache-control': 'no-store',
      },
    })
  },
)
