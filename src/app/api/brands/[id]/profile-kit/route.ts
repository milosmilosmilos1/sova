import { assertViewer, createHandler } from '@/lib/api/handler'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { getProfileKit } from '@/services/brand-brain/profile-kit'

/** Profili na mrežama (D-143): sačuvani opisi profila, sajt brenda i cena novih opisa. */
export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  getProfileKit(assertViewer(viewer), params.id),
)
