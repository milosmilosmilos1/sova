import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'

/**
 * Rokovi čuvanja podataka sa mreža (odluka vlasnika 22.11.2026, ODOBRENJA.md odeljak 4, D-181).
 *
 * - YouTube i Google poslovni profil: uvezene objave i metrike najviše 30 dana od poslednjeg
 *   osvežavanja (YouTube API Services i Google API politika: podaci se osvežavaju ili brišu u roku
 *   od 30 dana). Sinhronizacija osvežava `imported_at` i dodaje nove snimke metrika, pa se briše
 *   samo ono što 30 dana nije osveženo.
 * - Inbox (poruke, komentari, recenzije): razgovor bez nove poruke 12 meseci se briše sa porukama.
 *   Razgovori naloga koji je odvezan brišu se već pri odvezivanju (D-176).
 */
export const SHORT_RETENTION_PLATFORMS = ['youtube', 'google_business'] as const
export const SHORT_RETENTION_DAYS = 30
export const INBOX_RETENTION_MONTHS = 12

const DAY = 24 * 60 * 60_000
/** ID-jevi naloga u jednom upitu (`in` ide u adresu zahteva) */
const CHUNK = 200

export interface RetentionResult {
  historicalPosts: number
  metricSnapshots: number
  accountMetrics: number
  inboxThreads: number
}

export async function purgeExpiredNetworkData(now = new Date()): Promise<RetentionResult> {
  const admin = createSupabaseAdminClient()
  const short = new Date(now.getTime() - SHORT_RETENTION_DAYS * DAY).toISOString()
  const inbox = new Date(now)
  inbox.setUTCMonth(inbox.getUTCMonth() - INBOX_RETENTION_MONTHS)

  const { data: accounts, error } = await admin
    .from('social_accounts')
    .select('id')
    .in('platform', [...SHORT_RETENTION_PLATFORMS])
  if (error) throw mapDbError(error)
  const ids = (accounts ?? []).map((a) => a.id)

  const result: RetentionResult = {
    historicalPosts: 0,
    metricSnapshots: 0,
    accountMetrics: 0,
    inboxThreads: 0,
  }
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const posts = await admin
      .from('historical_posts')
      .delete({ count: 'exact' })
      .in('social_account_id', chunk)
      .lt('imported_at', short)
    if (posts.error) throw mapDbError(posts.error)
    result.historicalPosts += posts.count ?? 0

    const snapshots = await admin
      .from('post_metrics_snapshots')
      .delete({ count: 'exact' })
      .in('social_account_id', chunk)
      .lt('captured_at', short)
    if (snapshots.error) throw mapDbError(snapshots.error)
    result.metricSnapshots += snapshots.count ?? 0

    const daily = await admin
      .from('account_metrics_daily')
      .delete({ count: 'exact' })
      .in('social_account_id', chunk)
      .lt('captured_at', short)
    if (daily.error) throw mapDbError(daily.error)
    result.accountMetrics += daily.count ?? 0
  }

  // poruke idu sa razgovorom (ON DELETE CASCADE)
  const threads = await admin
    .from('inbox_threads')
    .delete({ count: 'exact' })
    .lt('last_message_at', inbox.toISOString())
  if (threads.error) throw mapDbError(threads.error)
  result.inboxThreads = threads.count ?? 0
  return result
}
