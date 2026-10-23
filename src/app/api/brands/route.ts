import { z } from 'zod'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { createBrandSchema } from '@/lib/schemas/workspace'
import { createBrand, listBrands } from '@/services/brands'

export const GET = createHandler(
  { auth: 'user', query: z.object({ workspaceId: z.uuid() }) },
  async ({ viewer, query }) => listBrands(assertViewer(viewer), query.workspaceId),
)

export const POST = createHandler(
  {
    auth: 'user',
    body: createBrandSchema,
    rateLimit: { name: 'brand-create', limit: 20, windowSec: 3600, by: 'user' },
  },
  async ({ viewer, body }) => createBrand(assertViewer(viewer), body),
)
