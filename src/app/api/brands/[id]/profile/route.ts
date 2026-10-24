import { assertViewer, createHandler } from '@/lib/api/handler'
import { updateProfileSchema } from '@/lib/schemas/brand'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { getProfileView, updateProfileFields } from '@/services/brand-brain/profile'

/** Trenutni profil brenda sa verzijama, zaključanim poljima i brojem chunkova znanja. */
export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  getProfileView(assertViewer(viewer), params.id),
)

/** Ručna izmena polja: nova verzija, izmenjena polja se zaključavaju za buduće analize. */
export const PATCH = createHandler(
  { auth: 'verified', params: uuidParamSchema, body: updateProfileSchema },
  async ({ viewer, params, body }) => updateProfileFields(assertViewer(viewer), params.id, body),
)
