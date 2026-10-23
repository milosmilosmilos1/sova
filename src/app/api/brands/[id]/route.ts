import { assertViewer, createHandler } from '@/lib/api/handler'
import { updateBrandSchema, uuidParamSchema } from '@/lib/schemas/workspace'
import { deleteBrand, getBrand, updateBrand } from '@/services/brands'

export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  getBrand(assertViewer(viewer), params.id),
)

export const PATCH = createHandler(
  { auth: 'user', params: uuidParamSchema, body: updateBrandSchema },
  async ({ viewer, params, body }) =>
    updateBrand(assertViewer(viewer), params.id, {
      name: body.name,
      website_url: body.websiteUrl,
      timezone: body.timezone,
      content_locale: body.contentLocale,
      status: body.status,
    }),
)

export const DELETE = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) => {
  await deleteBrand(assertViewer(viewer), params.id)
  return { deleted: true }
})
