import { assertViewer, createHandler } from '@/lib/api/handler'
import { updateBrandSchema, uuidParamSchema } from '@/lib/schemas/workspace'
import { deleteBrand, getBrand, updateBrand } from '@/services/brands'
import { cancelScheduledPostsForBrand } from '@/services/posts/publisher'
import { shiftBrandSchedule } from '@/services/posts/schedule-shift'

export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) =>
  getBrand(assertViewer(viewer), params.id),
)

export const PATCH = createHandler(
  { auth: 'user', params: uuidParamSchema, body: updateBrandSchema },
  async ({ viewer, params, body }) => {
    const v = assertViewer(viewer)
    const before = body.timezone && body.shiftSchedule ? await getBrand(v, params.id) : null
    const brand = await updateBrand(v, params.id, {
      name: body.name,
      website_url: body.websiteUrl,
      timezone: body.timezone,
      content_locale: body.contentLocale,
      status: body.status,
      report_emails: body.reportEmails,
    })
    const shifted =
      before && body.timezone && before.timezone !== body.timezone
        ? await shiftBrandSchedule(params.id, before.timezone, body.timezone)
        : null
    return { ...brand, shifted }
  },
)

export const DELETE = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) => {
  const v = assertViewer(viewer)
  await deleteBrand(v, params.id)
  const canceled = await cancelScheduledPostsForBrand(params.id, v.user.id)
  return { deleted: true, canceled }
})
