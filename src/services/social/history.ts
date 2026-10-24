import 'server-only'

import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { isProviderError } from '@/integrations/social/errors'
import { providerFor } from '@/integrations/social/registry'
import { loadAccountRow, markAccountStatus, refFor, tokensFor } from '@/services/social/accounts'
import type { Json } from '@/types/database'

export interface HistoryImportResult {
  status: 'imported' | 'skipped' | 'failed'
  imported: number
  reason?: string
}

/** Uvoz do 100 poslednjih objava (brif: istorija za ton i metrike); idempotentno po (nalog, external_id). */
export async function importAccountHistory(accountId: string, limit = 100): Promise<HistoryImportResult> {
  const row = await loadAccountRow(accountId)
  if (!row) return { status: 'skipped', imported: 0, reason: 'Nalog ne postoji.' }
  if (row.status !== 'active') return { status: 'skipped', imported: 0, reason: `Nalog je ${row.status}.` }
  const admin = createSupabaseAdminClient()
  try {
    const provider = providerFor(row.platform)
    const posts = await provider.fetchHistory(refFor(row), tokensFor(row).accessToken, limit)
    if (posts.length) {
      const rows = posts.map((p) => ({
        brand_id: row.brand_id,
        social_account_id: row.id,
        external_id: p.externalId,
        post_type: p.postType,
        text_content: p.text,
        media: (p.media as unknown as Json) ?? null,
        permalink: p.permalink,
        published_at: p.publishedAt,
        metrics: p.metrics as unknown as NonNullable<Json>,
        imported_at: new Date().toISOString(),
      }))
      const { error } = await admin
        .from('historical_posts')
        .upsert(rows, { onConflict: 'social_account_id,external_id' })
      if (error) throw error
    }
    await admin
      .from('social_accounts')
      .update({ last_synced_at: new Date().toISOString(), last_error: null })
      .eq('id', row.id)
    logger.info('social_history_imported', { accountId, platform: row.platform, count: posts.length })
    return { status: 'imported', imported: posts.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Uvoz nije uspeo.'
    if (isProviderError(error) && (error.code === 'TOKEN_INVALID' || error.code === 'PERMISSION_LOST')) {
      await markAccountStatus(row.id, 'needs_reauth', error.userMessage, message)
    } else {
      await admin
        .from('social_accounts')
        .update({ last_error: message.slice(0, 500) })
        .eq('id', row.id)
    }
    logger.warn('social_history_import_failed', { accountId, message })
    if (isProviderError(error) && error.retryable) throw error
    return { status: 'failed', imported: 0, reason: message }
  }
}
