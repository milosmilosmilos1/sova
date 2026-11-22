import 'server-only'

import { randomUUID } from 'node:crypto'

import { isFeatureEnabled, PUBLISH_CRON_FLAG } from '@/lib/flags'
import { logger } from '@/lib/logger'
import { sameMinute } from '@/lib/posts/publish-rules'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  handlePublishRunFailure,
  runPublishTarget,
  type PublishContext,
  type PublishJob,
  type PublishReport,
} from '@/services/posts/publisher'
import type { Database, Json } from '@/types/database'

/**
 * Objavljivanje bez Inngest-a (D-193). Kad je prekidač `publish_cron` uključen, iste korake objave
 * (`runPublishTarget`) pokreće Netlify na 2 minuta i „Objavi sada” odmah, a ovaj modul radi ono što je
 * radio Inngest: pamti završene korake sa rezultatom (`publish_runs.steps`), budi prolaz posle pauze
 * (ponovni pokušaj, obrada videa na mreži) i drži jedan prolaz po nalogu mreže u isto vreme.
 *
 * Svaki poziv ponavlja orkestraciju od početka; završeni koraci vraćaju zapamćen rezultat (JSON, kao
 * Inngest), a prvi nezavršen korak se izvršava. Pauza duža od nekoliko sekundi prekida poziv (`Yield`)
 * i upisuje kad treba nastaviti. Inngest-ov `cancelOn` zamenjuje `enqueueTargetUnscheduled` (otkazan prolaz).
 */
export async function cronPublishingEnabled(): Promise<boolean> {
  return isFeatureEnabled(PUBLISH_CRON_FLAG)
}

type RunRow = Database['public']['Tables']['publish_runs']['Row']
type StepMemo = { v: Json } | { wakeAt: string } | { slept: true }
type Steps = Record<string, StepMemo>
type EngineJob = PublishJob & { socialAccountId: string }

/** Prekid prolaza: nastavlja se kad dođe `wakeAt` (pauza ili potrošeno vreme poziva). */
class Yield {
  constructor(readonly wakeAt: Date) {}
}

export interface EngineOptions {
  now?: () => Date
  /** koliko dugo jedan poziv sme da započinje nove korake (Netlify funkcija ima granicu) */
  budgetMs?: number
}

/** Pauza kraća od ovoga se čeka u istom pozivu („Objavi sada”, termin za par sekundi). */
const INLINE_SLEEP_MS = 15_000
/** Koliko dugo je prolaz zauzet za jedan poziv; posle toga ga sme preuzeti sledeći. */
const LOCK_MS = 90_000
/** Naše greške (baza, mreža do Supabase-a) van pokušaja prema mreži: pauza, pa najviše tri puta. */
const ENGINE_MAX_RETRIES = 3
/** Target koji dospeva u narednih toliko sekundi dobija prolaz odmah. */
const DUE_LEAD_MS = 30_000

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function admin() {
  return createSupabaseAdminClient()
}

/** Prolazi za targete kojima je došao termin: nov, ili zamena kad je termin promenjen. */
export async function ensureRuns(now: Date, onlyTargetIds?: string[]): Promise<number> {
  const db = admin()
  let query = db
    .from('post_targets')
    .select('id, post_id, scheduled_at, social_account_id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date(now.getTime() + DUE_LEAD_MS).toISOString())
    .order('scheduled_at')
    .limit(200)
  if (onlyTargetIds?.length) query = query.in('id', onlyTargetIds)
  const { data: targets, error } = await query
  if (error) throw error
  if (!targets?.length) return 0

  const postIds = [...new Set(targets.map((t) => t.post_id))]
  const [{ data: posts }, { data: runs }] = await Promise.all([
    db.from('posts').select('id, version').in('id', postIds),
    db
      .from('publish_runs')
      .select('target_id, status, job')
      .in(
        'target_id',
        targets.map((t) => t.id),
      ),
  ])
  const versionOf = new Map((posts ?? []).map((p) => [p.id, p.version]))
  const runOf = new Map((runs ?? []).map((r) => [r.target_id, r]))

  let created = 0
  for (const t of targets) {
    if (!t.scheduled_at) continue
    const existing = runOf.get(t.id)
    const existingAt = (existing?.job as { scheduledAt?: string } | undefined)?.scheduledAt ?? null
    if (existing && existing.status === 'waiting' && sameMinute(existingAt, t.scheduled_at)) continue
    const job: EngineJob = {
      targetId: t.id,
      scheduledAt: t.scheduled_at,
      version: versionOf.get(t.post_id) ?? 0,
      socialAccountId: t.social_account_id,
    }
    const row = {
      target_id: t.id,
      run_id: `cron-${randomUUID()}`,
      job: job as unknown as Json,
      steps: {} as Json,
      wake_at: now.toISOString(),
      locked_until: null,
      status: 'waiting',
      outcome: null,
      error: null,
      engine_retries: 0,
      updated_at: now.toISOString(),
    }
    const { error: upsertError } = await db.from('publish_runs').upsert(row, { onConflict: 'target_id' })
    if (upsertError) throw upsertError
    created++
  }
  return created
}

/** Preuzima prolaz za ovaj poziv; drugi poziv ga ne dira dok zauzeće ne istekne. */
async function claim(targetId: string, now: Date): Promise<RunRow | null> {
  const db = admin()
  const { data } = await db
    .from('publish_runs')
    .update({ locked_until: new Date(now.getTime() + LOCK_MS).toISOString() })
    .eq('target_id', targetId)
    .eq('status', 'waiting')
    .lte('wake_at', now.toISOString())
    .or(`locked_until.is.null,locked_until.lt."${now.toISOString()}"`)
    .select('*')
    .maybeSingle()
  return data ?? null
}

/** Jedan prolaz po nalogu mreže u isto vreme (kao Inngest `concurrency` po socialAccountId). */
async function accountBusy(socialAccountId: string, exceptTargetId: string, now: Date): Promise<boolean> {
  const { count } = await admin()
    .from('publish_runs')
    .select('target_id', { count: 'exact', head: true })
    .eq('status', 'waiting')
    .eq('job->>socialAccountId', socialAccountId)
    .neq('target_id', exceptTargetId)
    .gt('locked_until', now.toISOString())
  return (count ?? 0) > 0
}

/** Nastavlja jedan prolaz koliko vreme poziva dozvoljava. */
export async function advanceRun(
  row: RunRow,
  opts: EngineOptions = {},
): Promise<PublishReport | 'yield' | 'error'> {
  const db = admin()
  const now = opts.now ?? (() => new Date())
  const budgetMs = opts.budgetMs ?? 20_000
  const started = Date.now()
  const steps: Steps = { ...((row.steps as Steps | null) ?? {}) }
  const job = row.job as unknown as EngineJob

  const save = async (patch: Database['public']['Tables']['publish_runs']['Update'] = {}) => {
    const { error } = await db
      .from('publish_runs')
      .update({ steps: steps as unknown as Json, updated_at: new Date().toISOString(), ...patch })
      .eq('target_id', row.target_id)
      .eq('run_id', row.run_id)
    if (error) throw error
  }

  const sleepStep = async (name: string, until: Date) => {
    const memo = steps[name]
    if (memo && 'slept' in memo) return
    const wakeAt = memo && 'wakeAt' in memo ? new Date(memo.wakeAt) : until
    const left = wakeAt.getTime() - now().getTime()
    if (left > 0 && (left > INLINE_SLEEP_MS || Date.now() - started + left > budgetMs)) {
      if (!memo) {
        steps[name] = { wakeAt: wakeAt.toISOString() }
        await save()
      }
      throw new Yield(wakeAt)
    }
    if (left > 0) await wait(left)
    steps[name] = { slept: true }
    await save()
  }

  const ctx: PublishContext = {
    runId: row.run_id,
    now,
    run: (async (name: string, fn: () => Promise<unknown>) => {
      const memo = steps[name]
      if (memo && 'v' in memo) return memo.v
      if (Date.now() - started > budgetMs) throw new Yield(now())
      const value = await fn()
      // kao Inngest: rezultat koraka je JSON i na prvom izvršavanju i pri ponavljanju
      const json = (value === undefined ? null : JSON.parse(JSON.stringify(value))) as Json
      steps[name] = { v: json }
      await save()
      return json
    }) as PublishContext['run'],
    sleepUntil: (name, at) => sleepStep(name, at),
    sleep: (name, ms) => {
      const memo = steps[name]
      const until = memo && 'wakeAt' in memo ? new Date(memo.wakeAt) : new Date(now().getTime() + ms)
      return sleepStep(name, until)
    },
    // termin je već upisan u bazi (pomeranje), pa ga sledeći prolaz sam nađe; „objavljeno” nema slušaoca
    sendEvent: async () => {},
  }

  try {
    const report = await runPublishTarget(job, ctx)
    await save({ status: 'done', outcome: report.outcome, error: report.message, locked_until: null })
    logger.info('publish_engine_done', { targetId: row.target_id, outcome: report.outcome })
    return report
  } catch (error) {
    if (error instanceof Yield) {
      await save({ wake_at: error.wakeAt.toISOString(), locked_until: null })
      return 'yield'
    }
    const message = error instanceof Error ? error.message : String(error)
    const retries = row.engine_retries + 1
    logger.error('publish_engine_error', { targetId: row.target_id, attempt: retries, error: message })
    if (retries >= ENGINE_MAX_RETRIES) {
      await handlePublishRunFailure(row.target_id, message)
      await save({ status: 'failed', error: message, engine_retries: retries, locked_until: null })
    } else {
      await save({
        error: message,
        engine_retries: retries,
        locked_until: null,
        wake_at: new Date(Date.now() + retries * 60_000).toISOString(),
      })
    }
    return 'error'
  }
}

export interface TickReport {
  enabled: boolean
  created: number
  advanced: number
  published: number
}

/**
 * Jedan krug: napravi prolaze za dospele targete pa nastavi one kojima je došlo vreme, dok traje
 * vreme poziva. `onlyTargetIds` je „Objavi sada”: samo ti targeti, odmah.
 */
export async function publishTick(
  opts: EngineOptions & { onlyTargetIds?: string[] } = {},
): Promise<TickReport> {
  const report: TickReport = { enabled: false, created: 0, advanced: 0, published: 0 }
  if (!(await cronPublishingEnabled())) return report
  report.enabled = true
  const now = opts.now ?? (() => new Date())
  const budgetMs = opts.budgetMs ?? 20_000
  const started = Date.now()

  report.created = await ensureRuns(now(), opts.onlyTargetIds)

  let query = admin()
    .from('publish_runs')
    .select('target_id, job')
    .eq('status', 'waiting')
    .lte('wake_at', now().toISOString())
    .order('wake_at')
    .limit(25)
  if (opts.onlyTargetIds?.length) query = query.in('target_id', opts.onlyTargetIds)
  const { data: due, error } = await query
  if (error) throw error

  for (const candidate of due ?? []) {
    const left = budgetMs - (Date.now() - started)
    if (left < 3_000) break
    const accountId = (candidate.job as { socialAccountId?: string } | null)?.socialAccountId
    if (accountId && (await accountBusy(accountId, candidate.target_id, now()))) continue
    const row = await claim(candidate.target_id, now())
    if (!row) continue
    report.advanced++
    const result = await advanceRun(row, { now: opts.now, budgetMs: left })
    if (typeof result === 'object' && result.outcome === 'published') report.published++
  }
  return report
}
