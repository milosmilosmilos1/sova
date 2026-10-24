import { assertViewer, createHandler } from '@/lib/api/handler'
import { calendarQuerySchema } from '@/lib/schemas/posts'
import { listCalendar } from '@/services/posts/calendar'

/** Kalendar: objave i targeti u opsegu (UTC; zona brenda u odgovoru za prikaz). */
export const GET = createHandler({ auth: 'user', query: calendarQuerySchema }, async ({ viewer, query }) =>
  listCalendar(assertViewer(viewer), query.brandId, query.from, query.to),
)
