import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { logger } from '@/lib/logger'
import { pushKeys, sendPush, type PushPayload } from '@/lib/push/web-push'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'

/**
 * Obaveštenja na telefonu (D-118): pretplata pregledača po uređaju, slanje uz obaveštenja koja to
 * traže (objava čeka odobrenje, objava nije uspela…) i brisanje pretplate koju servis više ne zna.
 */
export interface PushStatus {
  /** javni VAPID ključ za pretplatu; null kad obaveštenja na uređaju nisu podešena */
  publicKey: string | null
  devices: number
}

export async function getPushStatus(viewer: Viewer): Promise<PushStatus> {
  const keys = pushKeys()
  const { count } = await createSupabaseAdminClient()
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', viewer.user.id)
  return { publicKey: keys?.publicKey ?? null, devices: count ?? 0 }
}

export async function savePushSubscription(
  viewer: Viewer,
  input: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string | null,
): Promise<PushStatus> {
  if (!pushKeys()) throw new ApiError('VALIDATION', 'Obaveštenja na uređaju još nisu podešena.')
  // isti uređaj (endpoint) prelazi na korisnika koji je sada prijavljen
  const { error } = await createSupabaseAdminClient()
    .from('push_subscriptions')
    .upsert(
      {
        user_id: viewer.user.id,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        user_agent: userAgent?.slice(0, 300) ?? null,
      },
      { onConflict: 'endpoint' },
    )
  if (error) throw mapDbError(error)
  return getPushStatus(viewer)
}

export async function removePushSubscription(viewer: Viewer, endpoint: string): Promise<PushStatus> {
  const { error } = await createSupabaseAdminClient()
    .from('push_subscriptions')
    .delete()
    .eq('user_id', viewer.user.id)
    .eq('endpoint', endpoint)
  if (error) throw mapDbError(error)
  return getPushStatus(viewer)
}

/** Šalje svim uređajima korisnika; pretplate koje servis odbije kao nepostojeće se brišu. */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  if (!userIds.length || !pushKeys()) return 0
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', userIds)
  let sent = 0
  const gone: string[] = []
  const ok: string[] = []
  for (const sub of data ?? []) {
    try {
      const status = await sendPush(sub, payload)
      if (status === 404 || status === 410) gone.push(sub.id)
      else if (status >= 200 && status < 300) {
        sent++
        ok.push(sub.id)
      } else logger.warn('push_send_rejected', { status })
    } catch (error) {
      logger.warn('push_send_failed', { error })
    }
  }
  if (gone.length) await admin.from('push_subscriptions').delete().in('id', gone)
  if (ok.length)
    await admin.from('push_subscriptions').update({ last_sent_at: new Date().toISOString() }).in('id', ok)
  return sent
}

export async function sendTestPush(viewer: Viewer): Promise<{ sent: number }> {
  if (!pushKeys()) throw new ApiError('VALIDATION', 'Obaveštenja na uređaju još nisu podešena.')
  const sent = await sendPushToUsers([viewer.user.id], {
    title: 'Sova',
    body: 'Obaveštenja na ovom uređaju rade. Ovde stižu nacrti koji čekaju odluku.',
    url: '/app/approvals',
    tag: 'sova-test',
  })
  return { sent }
}
