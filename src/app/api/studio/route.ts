import { assertViewer, createHandler } from '@/lib/api/handler'
import { studioBrandQuerySchema } from '@/lib/schemas/studio'
import { clearStudioThread, getStudioThread } from '@/services/studio/chat'

/** Razgovor u Studiju (D-116): poruke korisnika za brend, cene i podrazumevane mreže. */
export const GET = createHandler({ auth: 'user', query: studioBrandQuerySchema }, async ({ viewer, query }) =>
  getStudioThread(assertViewer(viewer), query.brandId),
)

/** „Obriši razgovor”: poruke nestaju, objave koje je razgovor napravio ostaju. */
export const DELETE = createHandler(
  { auth: 'user', query: studioBrandQuerySchema },
  async ({ viewer, query }) => clearStudioThread(assertViewer(viewer), query.brandId),
)
