import { assertViewer, createHandler } from '@/lib/api/handler'
import { siteLogoPickSchema } from '@/lib/schemas/brand'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { listSiteLogos, pickSiteLogo } from '@/services/design/site-logos'

/** Poseta početnoj strani i preuzimanje do osam kandidata. */
export const maxDuration = 30

/** Logoi sa sajta za izbor (D-148), kad analiza nije pogodila pravi. */
export const GET = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    rateLimit: { name: 'site-logos', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params }) => listSiteLogos(assertViewer(viewer), params.id),
)

/** Izabran logo sa sajta postaje logo brenda. */
export const POST = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    body: siteLogoPickSchema,
    rateLimit: { name: 'site-logos', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, body }) => {
    const design = await pickSiteLogo(assertViewer(viewer), params.id, body.sourceUrl)
    return { logoAssetId: design.logoAssetId, logoSource: design.logoSource }
  },
)
