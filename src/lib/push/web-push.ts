import 'server-only'

import webpush from 'web-push'

import { env } from '@/lib/env'

/**
 * Web Push (D-118): VAPID ključevi iz env-a (testovi ih zamenjuju svojim). Bez ključeva Sova ne nudi
 * obaveštenja na uređaju i ništa ne šalje.
 */
export interface PushKeys {
  publicKey: string
  privateKey: string
  subject: string
}

let override: PushKeys | null | undefined

export function pushKeys(): PushKeys | null {
  if (override !== undefined) return override
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT }
}

export function setPushKeysForTests(keys: PushKeys | null | undefined): void {
  override = keys
}

export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushPayload {
  title: string
  body: string
  url: string
  tag?: string
}

/** Šalje jedno obaveštenje; vraća status servisa (201 uspeh, 404 i 410 znače da pretplata više ne važi). */
export async function sendPush(target: PushTarget, payload: PushPayload): Promise<number> {
  const keys = pushKeys()
  if (!keys) return 0
  try {
    const res = await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { vapidDetails: keys, TTL: 24 * 3600, urgency: 'normal' },
    )
    return res.statusCode
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (typeof status === 'number') return status
    throw error
  }
}
