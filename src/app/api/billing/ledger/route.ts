import { assertViewer, createHandler } from '@/lib/api/handler'
import { ledgerQuerySchema } from '@/lib/schemas/billing'
import { listTokenLedger } from '@/services/billing/billing'

/** Istorija tokena radnog prostora (vlasnik i administrator). */
export const GET = createHandler({ auth: 'user', query: ledgerQuerySchema }, async ({ viewer, query }) =>
  listTokenLedger(assertViewer(viewer), query.workspaceId, { before: query.before, limit: query.limit }),
)
