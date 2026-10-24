import type { SocialPlatform } from '@/config/platforms'
import { isProviderError } from '@/integrations/social/errors'
import { ApiError } from '@/lib/api/errors'
import type { PostStatus, TargetStatus } from '@/lib/posts/state-machine'

/**
 * Čista pravila publishera (faza 9b, ARCHITECTURE 3.3): koliko pokušaja i sa kojim pauzama,
 * kako se iz statusa targeta izvodi status objave, kako se greška mreže razvrstava.
 * Nema baze ni mreže — jedinično testirano u publish-rules.test.ts.
 */
export const MAX_PUBLISH_ATTEMPTS = 3
/** pauza posle 1., 2. i 3. neuspelog pokušaja (1, 5, 15 min) */
export const RETRY_DELAYS_MS = [60_000, 300_000, 900_000] as const

export function retryDelayMs(failedAttemptNo: number): number {
  const i = Math.min(Math.max(failedAttemptNo, 1), RETRY_DELAYS_MS.length) - 1
  return RETRY_DELAYS_MS[i]!
}

/** Dnevni limit API objava po nalogu (pokretni prozor 24 h); mreže bez zvaničnog limita nisu u mapi. */
export const DAILY_PUBLISH_LIMITS: Partial<Record<SocialPlatform, number>> = {
  instagram: 100,
  tiktok: 15,
  youtube: 6,
}

/** potpisani URL medija važi 24 h (N12) */
export const MEDIA_URL_TTL_SEC = 24 * 3600
/** IG kontejner: najviše 10 provera po minutu razmaka */
export const ASYNC_POLL_MAX = 10
export const ASYNC_POLL_INTERVAL_MS = 60_000

/** watchdog: target kasni ako je prošlo više od 3 min; alarm posle 15 min; „publishing” zaglavljen posle 30 min */
export const WATCHDOG_LATE_MS = 3 * 60_000
export const WATCHDOG_ALARM_MS = 15 * 60_000
export const STUCK_PUBLISHING_MS = 30 * 60_000
export const WATCHDOG_RESEND_COOLDOWN_MS = 10 * 60_000

export const PUBLISHED_LIKE: readonly TargetStatus[] = ['published', 'assisted_done', 'deleted_externally']
export const FAILED_LIKE: readonly TargetStatus[] = ['failed', 'canceled']

export function isTerminalTarget(status: TargetStatus): boolean {
  return PUBLISHED_LIKE.includes(status) || FAILED_LIKE.includes(status)
}

export type RollupStatus = Extract<
  PostStatus,
  'published' | 'failed' | 'partially_published' | 'publishing' | 'scheduled'
>

/**
 * Status objave iz statusa njenih targeta (K12):
 * - svi završeni: svi uspeli → published; nijedan → failed; mešano → partially_published
 * - ima neзавршених: ako se neki upravo objavljuje ili je neki već objavljen → publishing,
 *   inače → scheduled (svi još čekaju: zakazano, pauzirano, ručno, ponovno povezivanje)
 * - bez targeta → null (ne menjati)
 */
export function rollupPostStatus(statuses: readonly TargetStatus[]): RollupStatus | null {
  if (!statuses.length) return null
  const pending = statuses.filter((s) => !isTerminalTarget(s))
  const published = statuses.filter((s) => PUBLISHED_LIKE.includes(s)).length
  if (!pending.length) {
    if (published === statuses.length) return 'published'
    if (published === 0) return 'failed'
    return 'partially_published'
  }
  if (published > 0 || pending.includes('publishing')) return 'publishing'
  return 'scheduled'
}

export type FailureKind = 'retry' | 'permanent' | 'reauth' | 'quota' | 'duplicate'

export interface ClassifiedFailure {
  kind: FailureKind
  code: string
  /** poruka za korisnika, na srpskom */
  message: string
  /** tehnički detalj za log i publish_attempts */
  detail: string
  httpStatus: number | null
}

const NETWORK_MESSAGE = 'Mreža trenutno ne odgovara. Sova će pokušati ponovo.'

export function classifyPublishError(error: unknown): ClassifiedFailure {
  if (isProviderError(error)) {
    const base = {
      code: error.code,
      message: error.userMessage,
      detail: error.message,
      httpStatus: error.status,
    }
    if (error.code === 'TOKEN_INVALID' || error.code === 'PERMISSION_LOST') return { kind: 'reauth', ...base }
    if (error.code === 'QUOTA_EXCEEDED') return { kind: 'quota', ...base }
    if (error.code === 'DUPLICATE') return { kind: 'duplicate', ...base }
    if (error.retryable) return { kind: 'retry', ...base }
    return { kind: 'permanent', ...base }
  }
  if (error instanceof ApiError) {
    return {
      kind: 'permanent',
      code: error.code,
      message: error.message,
      detail: error.message,
      httpStatus: null,
    }
  }
  const msg = error instanceof Error ? error.message : String(error)
  // fetch/undici greške (ECONNRESET, timeout, DNS) su privremene
  return { kind: 'retry', code: 'NETWORK', message: NETWORK_MESSAGE, detail: msg, httpStatus: null }
}

/** Sledeći termin za pomeranje zbog limita: isto vreme sutra (pokretni prozor od 24 h). */
export function nextDaySameTime(from: Date): Date {
  return new Date(from.getTime() + 24 * 3600_000)
}

/** Sledeći pun minut sa malom rezervom (publisher ga odmah uzima). */
export function nextFullMinute(now: Date, graceMs = 15_000): Date {
  return new Date(Math.ceil((now.getTime() + graceMs) / 60_000) * 60_000)
}

/** Da li se dva ISO vremena odnose na isti minut (poređenje run-a i stanja u bazi). */
export function sameMinute(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return Math.floor(new Date(a).getTime() / 60_000) === Math.floor(new Date(b).getTime() / 60_000)
}

export { TARGET_STATUS_LABEL, targetStatusLabel } from '@/config/post-labels'
