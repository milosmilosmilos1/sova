import 'server-only'

import { encryptSecret, toPgBytea } from '@/lib/crypto/tokens'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { isProviderError } from '@/integrations/social/errors'
import { getMetaProvider } from '@/integrations/social/registry'
import { markAccountStatus, tokensFor, type SocialAccountRow } from '@/services/social/account-rows'
import { refreshAccountTokens } from '@/services/social/tokens'
import { notifyUsers, usersWithRoles } from '@/services/notifications'
import type { Json } from '@/types/database'

export interface RefreshSummary {
  checked: number
  refreshed: number
  needsReauth: number
  errors: number
}

/**
 * Dnevno osvežavanje (ARCHITECTURE 6, `social-token-refresh`): Meta dugotrajan korisnički token
 * (60 dana) se produžava ponovnom razmenom kad ističe za < 7 dana; Page tokeni se ponovo čitaju.
 * Neuspeh → `needs_reauth` (publisher pauzira targete u fazi 9b).
 */
export async function refreshExpiringTokens(withinDays = 7): Promise<RefreshSummary> {
  const admin = createSupabaseAdminClient()
  const cutoff = new Date(Date.now() + withinDays * 86_400_000).toISOString()
  const { data, error } = await admin
    .from('social_accounts')
    .select('*')
    .in('platform', ['facebook', 'instagram'])
    .eq('status', 'active')
    .not('refresh_token_expires_at', 'is', null)
    .lt('refresh_token_expires_at', cutoff)
    .limit(500)
  if (error) throw error
  const rows = data ?? []
  const summary: RefreshSummary = { checked: rows.length, refreshed: 0, needsReauth: 0, errors: 0 }
  // isti korisnički token deli više naloga (stranica + IG): osvežava se jednom po (brend, metaUserId)
  const groups = new Map<string, SocialAccountRow[]>()
  for (const r of rows) {
    const meta = (r.metadata as Record<string, Json> | null) ?? {}
    const key = `${r.brand_id}:${String(meta.metaUserId ?? r.external_parent_id ?? r.external_id)}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const provider = getMetaProvider()
  for (const group of groups.values()) {
    const lead = group[0]!
    try {
      const tokens = await provider.refreshUserToken(tokensFor(lead))
      const accounts = await provider.listAccounts(tokens)
      for (const r of group) {
        const fresh = accounts.find((a) => a.platform === r.platform && a.externalId === r.external_id)
        const aad = `social:${r.brand_id}:${r.platform}:${r.external_id}`
        if (!fresh) {
          await markAccountStatus(r.id, 'disabled', 'Nalog više nije dostupan kroz Facebook prijavu.')
          summary.needsReauth++
          continue
        }
        const access = encryptSecret(fresh.token.accessToken, aad)
        const refresh = encryptSecret(tokens.refreshToken ?? tokens.accessToken, aad)
        await admin
          .from('social_accounts')
          .update({
            access_token_enc: toPgBytea(access.ciphertext),
            refresh_token_enc: toPgBytea(refresh.ciphertext),
            key_version: access.keyVersion,
            refresh_token_expires_at: tokens.refreshExpiresAt,
            token_expires_at: null,
            name: fresh.name,
            avatar_url: fresh.avatarUrl,
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', r.id)
        summary.refreshed++
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Osvežavanje nije uspelo.'
      if (isProviderError(error) && (error.code === 'TOKEN_INVALID' || error.code === 'PERMISSION_LOST')) {
        for (const r of group) await markAccountStatus(r.id, 'needs_reauth', error.userMessage, message)
        summary.needsReauth += group.length
      } else {
        for (const r of group)
          await admin
            .from('social_accounts')
            .update({ last_error: message.slice(0, 500) })
            .eq('id', r.id)
        summary.errors += group.length
      }
      logger.warn('social_token_refresh_failed', { brandId: lead.brand_id, message })
    }
  }
  logger.info('social_token_refresh_done', summary as unknown as Record<string, unknown>)
  return summary
}

/**
 * LinkedIn i TikTok (faza 8b, D-076): TikTok pristupni token (24 h) se osvežava kad ističe za manje od
 * 6 h; LinkedIn sa programskim refresh-om kad ističe za manje od 7 dana. LinkedIn bez refresh tokena
 * se ne može produžiti: vlasnici dobijaju obaveštenje 7 dana pre isteka (jednom), a posle isteka
 * nalog prelazi u `needs_reauth` i publisher ga ne koristi dok se ne poveže ponovo.
 */
export async function refreshOtherTokens(): Promise<RefreshSummary> {
  const admin = createSupabaseAdminClient()
  const now = Date.now()
  const { data, error } = await admin
    .from('social_accounts')
    .select('*')
    .in('platform', ['linkedin', 'tiktok'])
    .eq('status', 'active')
    .not('token_expires_at', 'is', null)
    .lt('token_expires_at', new Date(now + 7 * 86_400_000).toISOString())
    .limit(500)
  if (error) throw error
  const rows = data ?? []
  const summary: RefreshSummary = { checked: rows.length, refreshed: 0, needsReauth: 0, errors: 0 }
  for (const r of rows) {
    const exp = new Date(r.token_expires_at!).getTime()
    const hasRefresh = Boolean(r.refresh_token_enc)
    try {
      if (r.platform === 'tiktok') {
        if (exp - now > 6 * 3600_000) continue
        await refreshAccountTokens(r)
        summary.refreshed++
        continue
      }
      if (hasRefresh) {
        await refreshAccountTokens(r)
        summary.refreshed++
        continue
      }
      if (exp <= now) {
        await markAccountStatus(
          r.id,
          'needs_reauth',
          'LinkedIn veza je istekla (60 dana). Povežite nalog ponovo.',
        )
        summary.needsReauth++
        continue
      }
      await notifyLinkedInExpiry(r, exp)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Osvežavanje nije uspelo.'
      if (isProviderError(err) && (err.code === 'TOKEN_INVALID' || err.code === 'PERMISSION_LOST')) {
        await markAccountStatus(r.id, 'needs_reauth', err.userMessage, message)
        summary.needsReauth++
      } else {
        await admin
          .from('social_accounts')
          .update({ last_error: message.slice(0, 500) })
          .eq('id', r.id)
        summary.errors++
      }
      logger.warn('social_token_refresh_failed', { accountId: r.id, platform: r.platform, message })
    }
  }
  logger.info('social_token_refresh_other_done', summary as unknown as Record<string, unknown>)
  return summary
}

async function notifyLinkedInExpiry(row: SocialAccountRow, exp: number): Promise<void> {
  const meta = (row.metadata as Record<string, Json> | null) ?? {}
  if (typeof meta.expiryNotifiedAt === 'string') return
  const days = Math.max(1, Math.ceil((exp - Date.now()) / 86_400_000))
  const admin = createSupabaseAdminClient()
  await notifyUsers({
    userIds: await usersWithRoles(row.workspace_id, row.brand_id, ['owner', 'admin']),
    workspaceId: row.workspace_id,
    brandId: row.brand_id,
    type: 'account_expiring',
    title: 'LinkedIn veza uskoro ističe',
    body: `${row.name}: veza ističe za ${days} ${days === 1 ? 'dan' : 'dana'}. Povežite nalog ponovo na strani Mreže da objave ne bi stale.`,
    link: '/app/accounts',
    data: { socialAccountId: row.id, platform: row.platform },
  })
  await admin
    .from('social_accounts')
    .update({ metadata: { ...meta, expiryNotifiedAt: new Date().toISOString() } as NonNullable<Json> })
    .eq('id', row.id)
}
