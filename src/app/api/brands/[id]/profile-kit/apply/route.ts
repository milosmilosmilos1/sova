import { assertViewer, createHandler } from '@/lib/api/handler'
import { profileApplySchema } from '@/lib/schemas/profile-kit'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { applyProfileBio } from '@/services/brand-brain/profile-kit-edit'

/** Poziv mreže za svaku povezanu lokaciju brenda. */
export const maxDuration = 30

/** Upis opisa na profil (D-166): za sada Google poslovni profil, ostale mreže to ne dozvoljavaju. */
export const POST = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    body: profileApplySchema,
    rateLimit: { name: 'profile-kit-apply', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, body }) => applyProfileBio(assertViewer(viewer), params.id, body.platform),
)
