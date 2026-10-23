import { z } from 'zod'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { acceptInvitation } from '@/services/team'

export const POST = createHandler(
  {
    auth: 'user',
    // segment se zove [id] zbog Next pravila o istom nazivu slug-a; vrednost je token pozivnice
    params: z.object({ id: z.string().min(20).max(200) }),
    rateLimit: { name: 'invitation-accept', limit: 10, windowSec: 60 * 15, by: 'ip' },
  },
  async ({ viewer, params }) => acceptInvitation(assertViewer(viewer), params.id),
)
