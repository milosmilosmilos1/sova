import { createHandler } from '@/lib/api/handler'
import { googleFontQuerySchema } from '@/lib/schemas/design'
import { checkGoogleFont } from '@/services/design/custom-fonts'

/** Da li Google Fonts ima porodicu sa tim imenom (D-159), pre nego što je korisnik izabere. */
export const GET = createHandler(
  {
    auth: 'user',
    query: googleFontQuerySchema,
    rateLimit: { name: 'google-font-check', limit: 30, windowSec: 60, by: 'user' },
  },
  async ({ query }) => checkGoogleFont(query.family),
)
