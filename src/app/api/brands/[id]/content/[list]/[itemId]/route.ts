import { z } from 'zod'

import { assertViewer, createHandler } from '@/lib/api/handler'
import { contentItemParamSchema } from '@/lib/schemas/brand-content'
import { removeContentItem, updateContentItem } from '@/services/brand-content'

export const PATCH = createHandler(
  {
    auth: 'user',
    params: contentItemParamSchema,
    body: z.unknown(),
    rateLimit: { name: 'brand-content', limit: 60, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, body }) =>
    updateContentItem(assertViewer(viewer), params.id, params.list, params.itemId, body),
)

export const DELETE = createHandler(
  {
    auth: 'user',
    params: contentItemParamSchema,
    rateLimit: { name: 'brand-content', limit: 60, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params }) =>
    removeContentItem(assertViewer(viewer), params.id, params.list, params.itemId),
)
