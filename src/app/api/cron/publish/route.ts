import { createHandler } from '@/lib/api/handler'
import { publishTick } from '@/services/posts/publish-engine'

/**
 * Krug objava bez Inngest-a (D-193): poziva ga Netlify zakazana funkcija `publish-tick` na 2 minuta,
 * sa `Authorization: Bearer CRON_SECRET`. Dok je prekidač `publish_cron` isključen, ne radi ništa.
 */
export const maxDuration = 60

export const POST = createHandler({ auth: 'cron' }, async () => publishTick({ budgetMs: 20_000 }))
