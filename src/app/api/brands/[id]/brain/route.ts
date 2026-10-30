import { assertViewer, createHandler } from '@/lib/api/handler'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { getBrainView } from '@/services/brand-brain/brain'

/** Strana Brain (D-113): šta Sova zna o brendu, izvori i playbook iz rezultata. */
export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  getBrainView(assertViewer(viewer), params.id),
)
