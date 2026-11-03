import { assertViewer, createHandler } from '@/lib/api/handler'
import { profileLookSchema } from '@/lib/schemas/brand'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { getProfileKit, saveProfileColor } from '@/services/brand-brain/profile-kit'

/** Profili na mrežama (D-143): sačuvani opisi profila, sajt brenda i cena novih opisa. */
export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  getProfileKit(assertViewer(viewer), params.id),
)

/** Boja slika profila (D-148): jedna od tri sa sajta ili svoja; `null` vraća prvu sa sajta. */
export const PATCH = createHandler(
  { auth: 'user', params: uuidParamSchema, body: profileLookSchema },
  async ({ viewer, params, body }) => saveProfileColor(assertViewer(viewer), params.id, body.color),
)
