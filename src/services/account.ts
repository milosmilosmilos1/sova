import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { requireMembership } from '@/lib/auth/workspace'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { providerFor } from '@/integrations/social/registry'
import { notifyUsers } from '@/services/notifications'
import { tokensFor } from '@/services/social/account-rows'
import type { Json } from '@/types/database'

/**
 * Nalog korisnika (faza 11a, brif 4: GDPR i Zakon o zaštiti podataka o ličnosti): izvoz podataka,
 * brisanje naloga iz aplikacije i prenos vlasništva radnog prostora. Isti plan brisanja koristi i
 * admin panel (`services/admin/users.ts`).
 */

export interface DeletionPlan {
  /** radni prostori sa drugim članovima: vlasništvo mora prvo da se prenese */
  blocking: Array<{ id: string; name: string }>
  /** radni prostori u kojima je korisnik sam: brišu se sa nalogom */
  solo: string[]
}

export async function planAccountDeletion(userId: string): Promise<DeletionPlan> {
  const admin = createSupabaseAdminClient()
  const { data: owned } = await admin
    .from('workspaces')
    .select('id, name')
    .eq('owner_id', userId)
    .is('deleted_at', null)
  const plan: DeletionPlan = { blocking: [], solo: [] }
  for (const w of owned ?? []) {
    const { count } = await admin
      .from('workspace_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('workspace_id', w.id)
      .neq('user_id', userId)
    if ((count ?? 0) > 0) plan.blocking.push({ id: w.id, name: w.name })
    else plan.solo.push(w.id)
  }
  return plan
}

/**
 * Veze sa mrežama radnih prostora koji se brišu: opoziv kod mreže (najbolji napor, jednom po
 * korisniku mreže) pa brisanje tokena kod nas, da tokeni ne prežive ni ako brisanje stane na pola.
 */
export async function revokeWorkspaceSocialAccounts(
  workspaceIds: string[],
  opts: { atNetwork: boolean; reason: string },
): Promise<number> {
  if (!workspaceIds.length) return 0
  const admin = createSupabaseAdminClient()
  const { data: rows } = await admin.from('social_accounts').select('*').in('workspace_id', workspaceIds)
  const revoked = new Set<string>()
  for (const row of rows ?? []) {
    if (!opts.atNetwork || !row.access_token_enc) continue
    const meta = (row.metadata as Record<string, Json> | null) ?? {}
    const userKey = `${row.platform === 'instagram' ? 'facebook' : row.platform}:${String(meta.providerUserId ?? meta.metaUserId ?? row.external_id)}`
    if (revoked.has(userKey)) continue
    revoked.add(userKey)
    try {
      await providerFor(row.platform).revoke(
        tokensFor(row),
        typeof meta.providerUserId === 'string' ? meta.providerUserId : null,
      )
    } catch (error) {
      logger.warn('account_delete_revoke_failed', { accountId: row.id, platform: row.platform, error })
    }
  }
  if (rows?.length) {
    await admin
      .from('social_accounts')
      .update({
        status: 'revoked',
        access_token_enc: null,
        refresh_token_enc: null,
        status_reason: opts.reason,
      })
      .in('workspace_id', workspaceIds)
  }
  return rows?.length ?? 0
}

function blockingError(plan: DeletionPlan): ApiError {
  return new ApiError(
    'CONFLICT',
    `Vlasnik ste radnih prostora sa drugim članovima (${plan.blocking.map((b) => b.name).join(', ')}). Prvo prenesite vlasništvo na strani Tim.`,
    { details: { workspaces: plan.blocking } },
  )
}

/** Prijavljivanja korisnika (email/lozinka, Google…) — od toga zavisi kako potvrđuje identitet. */
export async function authProviders(
  userId: string,
): Promise<{ providers: string[]; lastSignInAt: string | null }> {
  const { data } = await createSupabaseAdminClient().auth.admin.getUserById(userId)
  return {
    providers: [...new Set((data.user?.identities ?? []).map((i) => i.provider))],
    lastSignInAt: data.user?.last_sign_in_at ?? null,
  }
}

const RECENT_LOGIN_MS = 15 * 60_000

/** Ponovna potvrda identiteta pre brisanja: lozinka, a za naloge bez lozinke sveža prijava. */
async function reauthenticate(viewer: Viewer, password: string | undefined): Promise<void> {
  const { providers, lastSignInAt } = await authProviders(viewer.user.id)
  if (providers.includes('email')) {
    if (!password)
      throw new ApiError('VALIDATION', 'Upišite lozinku kao potvrdu.', { fields: { password: ['obavezno'] } })
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { error } = await client.auth.signInWithPassword({ email: viewer.user.email, password })
    if (error) throw new ApiError('FORBIDDEN', 'Lozinka nije tačna.')
    return
  }
  if (!lastSignInAt || Date.now() - Date.parse(lastSignInAt) > RECENT_LOGIN_MS) {
    throw new ApiError(
      'CONFLICT',
      'Iz bezbednosnih razloga se odjavite i prijavite ponovo, pa obrišite nalog u narednih 15 minuta.',
    )
  }
}

/**
 * Brisanje sopstvenog naloga: potvrda emailom i lozinkom (ili svežom prijavom), vlasnik tima prvo
 * prenosi vlasništvo, radni prostori u kojima je korisnik sam brišu se sa nalogom (kaskada), veze sa
 * mrežama se opozivaju. Objave u tuđim radnim prostorima ostaju bez autora (created_by → NULL).
 */
export async function deleteOwnAccount(
  viewer: Viewer,
  input: { confirmEmail: string; password?: string },
): Promise<{ workspacesDeleted: number }> {
  if (viewer.impersonation) throw new ApiError('FORBIDDEN', 'Nalog se ne briše tokom impersonacije.')
  if (input.confirmEmail.trim().toLowerCase() !== viewer.user.email.toLowerCase()) {
    throw new ApiError('VALIDATION', 'Upišite tačan email naloga kao potvrdu.', {
      fields: { confirmEmail: ['email ne odgovara'] },
    })
  }
  if (viewer.profile.platformRole === 'platform_admin') {
    throw new ApiError(
      'FORBIDDEN',
      'Nalog platform admina se ne briše iz aplikacije; prvo uklonite admin ulogu.',
    )
  }
  await reauthenticate(viewer, input.password)
  const plan = await planAccountDeletion(viewer.user.id)
  if (plan.blocking.length) throw blockingError(plan)
  await revokeWorkspaceSocialAccounts(plan.solo, { atNetwork: true, reason: 'Korisnik je obrisao nalog.' })
  const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(viewer.user.id)
  if (error) {
    logger.error('account_delete_failed', { userId: viewer.user.id, error: error.message })
    throw new ApiError('INTERNAL', 'Brisanje naloga nije uspelo. Pokušajte ponovo ili se javite podršci.')
  }
  logger.info('account_deleted_by_user', { userId: viewer.user.id, workspacesDeleted: plan.solo.length })
  return { workspacesDeleted: plan.solo.length }
}

/** Prenos vlasništva na postojećeg člana; dosadašnji vlasnik postaje administrator. */
export async function transferOwnership(
  viewer: Viewer,
  workspaceId: string,
  newOwnerId: string,
): Promise<void> {
  const ws = await requireMembership(viewer, workspaceId, ['owner'])
  if (newOwnerId === viewer.user.id) throw new ApiError('VALIDATION', 'Već ste vlasnik ovog radnog prostora.')
  const { data: member } = await viewer.supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', newOwnerId)
    .maybeSingle()
  if (!member) throw new ApiError('NOT_FOUND', 'Novi vlasnik mora biti član radnog prostora.')
  const { error } = await viewer.supabase.rpc('transfer_workspace_ownership', {
    p_workspace_id: workspaceId,
    p_new_owner: newOwnerId,
  })
  if (error) throw mapDbError(error)
  await notifyUsers({
    userIds: [newOwnerId],
    workspaceId,
    brandId: null,
    type: 'workspace_ownership',
    title: 'Postali ste vlasnik radnog prostora',
    body: `${viewer.profile.fullName ?? viewer.user.email} vam je preneo vlasništvo nad radnim prostorom „${ws.name}”.`,
    link: '/app/team',
  })
  logger.info('workspace_ownership_transferred', { workspaceId, from: viewer.user.id, to: newOwnerId })
}

const MAX_ROWS = 5000
const STRIP: Record<string, string[]> = {
  social_accounts: ['access_token_enc', 'refresh_token_enc', 'key_version'],
  ai_generations: [
    'cost_usd',
    'provider_input_tokens',
    'provider_output_tokens',
    'provider_images',
    'inngest_run_id',
    'request_id',
    'idempotency_key',
    'token_reservation_id',
  ],
}

function strip(table: string, rows: Array<Record<string, unknown>> | null): Array<Record<string, unknown>> {
  const drop = STRIP[table] ?? []
  return (rows ?? []).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k))))
}

/**
 * Izvoz podataka (pravo na prenosivost): profil, članstva, sve iz radnih prostora čiji je korisnik
 * vlasnik, njegove objave i komentari u tuđim radnim prostorima, obaveštenja i podešavanja. Bez
 * tokena mreža i internih troškova; mediji sa linkovima koji važe 7 dana.
 */
export async function exportAccountData(viewer: Viewer): Promise<Record<string, unknown>> {
  if (viewer.impersonation)
    throw new ApiError('FORBIDDEN', 'Izvoz podataka nije dostupan tokom impersonacije.')
  const admin = createSupabaseAdminClient()
  const userId = viewer.user.id
  const [{ data: profile }, auth, { data: memberships }, { data: owned }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, email, full_name, avatar_url, locale, timezone, email_verified_at, created_at')
      .eq('id', userId)
      .single(),
    authProviders(userId),
    admin
      .from('workspace_members')
      .select('workspace_id, role, all_brands, created_at, workspaces(name, type)')
      .eq('user_id', userId),
    admin.from('workspaces').select('*').eq('owner_id', userId),
  ])
  const ownedIds = (owned ?? []).map((w) => w.id)
  const byWorkspace = async (table: string, column = 'workspace_id') => {
    if (!ownedIds.length) return []
    const { data } = await (
      admin.from(table as 'posts') as unknown as {
        select: (s: string) => {
          in: (
            c: string,
            v: string[],
          ) => { limit: (n: number) => Promise<{ data: Array<Record<string, unknown>> | null }> }
        }
      }
    )
      .select('*')
      .in(column, ownedIds)
      .limit(MAX_ROWS)
    return strip(table, data)
  }
  const [brands, posts, socialAccounts, media, ledger, grants, generations] = await Promise.all([
    byWorkspace('brands'),
    byWorkspace('posts'),
    byWorkspace('social_accounts'),
    byWorkspace('media_assets'),
    byWorkspace('token_ledger'),
    byWorkspace('token_grants'),
    byWorkspace('ai_generations'),
  ])
  const brandIds = brands.map((b) => String(b.id))
  const postIds = posts.map((p) => String(p.id))
  const inBrands = async (table: string) => {
    if (!brandIds.length) return []
    const { data } = await (
      admin.from(table as 'posts') as unknown as {
        select: (s: string) => {
          in: (
            c: string,
            v: string[],
          ) => { limit: (n: number) => Promise<{ data: Array<Record<string, unknown>> | null }> }
        }
      }
    )
      .select('*')
      .in('brand_id', brandIds)
      .limit(MAX_ROWS)
    return strip(table, data)
  }
  const [brandProfiles, pillars, campaigns, historicalPosts, strategies, suggestions, insights] =
    await Promise.all([
      inBrands('brand_profiles'),
      inBrands('content_pillars'),
      inBrands('campaigns'),
      inBrands('historical_posts'),
      inBrands('strategies'),
      inBrands('suggestions'),
      inBrands('insights'),
    ])
  const targets = postIds.length
    ? ((await admin.from('post_targets').select('*').in('post_id', postIds.slice(0, 1000)).limit(MAX_ROWS))
        .data ?? [])
    : []

  // linkovi do fajlova (7 dana), grupisano po bucket-u
  const signed = new Map<string, string>()
  const byBucket = new Map<string, string[]>()
  for (const m of media.slice(0, 500)) {
    const bucket = String(m.bucket)
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), String(m.storage_path)])
  }
  for (const [bucket, paths] of byBucket) {
    const { data } = await admin.storage.from(bucket).createSignedUrls(paths, 7 * 86_400)
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(`${bucket}/${s.path}`, s.signedUrl)
  }

  const [
    { data: authoredPosts },
    { data: comments },
    { data: notifications },
    { data: prefs },
    { data: invitations },
  ] = await Promise.all([
    admin
      .from('posts')
      .select('id, workspace_id, brand_id, title, master_text, status, created_at')
      .eq('created_by', userId)
      .limit(MAX_ROWS),
    admin
      .from('post_comments')
      .select('id, post_id, body, created_at')
      .eq('author_id', userId)
      .limit(MAX_ROWS),
    admin
      .from('notifications')
      .select('type, title, body, data, read_at, created_at')
      .eq('user_id', userId)
      .limit(MAX_ROWS),
    admin
      .from('notification_preferences')
      .select('workspace_id, type, channel, enabled')
      .eq('user_id', userId),
    admin
      .from('invitations')
      .select('workspace_id, email, role, created_at, accepted_at')
      .eq('invited_by', userId)
      .limit(MAX_ROWS),
  ])

  return {
    format: 'sova-izvoz-v1',
    generatedAt: new Date().toISOString(),
    note: 'Izvoz podataka iz Sove. Tokeni mreža i interni troškovi nisu uključeni; linkovi do medija važe 7 dana.',
    profile,
    auth: { providers: auth.providers, lastSignInAt: auth.lastSignInAt },
    memberships: memberships ?? [],
    ownedWorkspaces: (owned ?? []).map((w) => {
      const wsBrands = brands.filter((b) => b.workspace_id === w.id).map((b) => String(b.id))
      const ofBrand = (rows: Array<Record<string, unknown>>) =>
        rows.filter((r) => wsBrands.includes(String(r.brand_id)))
      return {
        ...w,
        brands: brands.filter((b) => b.workspace_id === w.id),
        brandProfiles: ofBrand(brandProfiles),
        socialAccounts: socialAccounts.filter((a) => a.workspace_id === w.id),
        posts: posts.filter((p) => p.workspace_id === w.id),
        postTargets: targets.filter((t) => posts.some((p) => p.id === t.post_id && p.workspace_id === w.id)),
        media: media
          .filter((m) => m.workspace_id === w.id)
          .map((m) => ({ ...m, downloadUrl: signed.get(`${m.bucket}/${m.storage_path}`) ?? null })),
        strategies: ofBrand(strategies),
        contentPillars: ofBrand(pillars),
        campaigns: ofBrand(campaigns),
        historicalPosts: ofBrand(historicalPosts),
        tokenLedger: ledger.filter((l) => l.workspace_id === w.id),
        tokenGrants: grants.filter((g) => g.workspace_id === w.id),
        aiGenerations: generations.filter((g) => g.workspace_id === w.id),
        suggestions: ofBrand(suggestions),
        insights: ofBrand(insights),
      }
    }),
    authoredElsewhere: {
      posts: (authoredPosts ?? []).filter((p) => !ownedIds.includes(p.workspace_id)),
      comments: comments ?? [],
    },
    notifications: notifications ?? [],
    notificationPreferences: prefs ?? [],
    invitationsSent: invitations ?? [],
  }
}
