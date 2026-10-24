import { assertViewer, createHandler } from '@/lib/api/handler'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { getTikTokCreatorInfo } from '@/services/social/tiktok'

/** Šta TikTok nalog sme pri objavi (privatnosti, komentari, duet, stitch, najduži video). */
export const GET = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    // TikTok dozvoljava 20 upita u minuti po tokenu
    rateLimit: { name: 'tiktok-creator', limit: 15, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params }) => getTikTokCreatorInfo(assertViewer(viewer), params.id),
)
