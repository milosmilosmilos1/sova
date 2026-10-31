'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarRange,
  CheckCircle2,
  Clapperboard,
  GalleryHorizontalEnd,
  Image as ImageIcon,
  Link2,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Smartphone,
  Trash2,
  Type,
  Wand2,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { BulkBar, SelectAllBox, SelectBox, useSelection } from '@/components/shared/bulk'
import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CONTENT_LOCALES } from '@/config/locales'
import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { PLATFORM_FORMATS, POST_FORMATS, type PostFormat } from '@/config/post-formats'
import { buildSlots, MONTH_OPTIONS, monthEnd, PER_WEEK_OPTIONS, slotMonths } from '@/lib/plans/slots'
import { cn } from '@/lib/utils'

/**
 * Mesečni plan (D-119): izbor početka, broja meseci (do tri, D-120), broja objava i mreža (sve vrste
 * su uključene), Sova bira teme za sve termine, vi izbacite šta ne želite ili promenite temu i
 * termin, a „Generiši sve” pravi sve nacrte u pozadini. Strana se sama osvežava dok Sova radi.
 */
type Status = 'planning' | 'ready' | 'generating' | 'done' | 'failed'
type ItemStatus = 'planned' | 'generating' | 'done' | 'failed'

interface Item {
  id: string
  scheduledFor: string
  date: string
  time: string
  format: PostFormat
  platforms: SocialPlatform[]
  topic: string
  brief: string
  goal: string
  pillar: string | null
  cta: string | null
  status: ItemStatus
  postId: string | null
  error: string | null
}

interface Plan {
  id: string
  month: string
  periodStart: string
  periodEnd: string
  status: Status
  settings: {
    kind: 'current' | 'next'
    months?: number
    perWeek: number
    platforms: SocialPlatform[]
    formats: PostFormat[]
    mode?: string
  }
  error: string | null
  tokensCharged: number
  items: Item[]
  counts: Record<ItemStatus, number>
}

interface Page {
  plan: Plan | null
  options: {
    platforms: SocialPlatform[]
    months: Array<{ kind: 'current' | 'next'; month: string; start: string; end: string }>
    prices: { plan: number; post: number }
    balance: number
    timezone: string
    locale: string
    canSchedule: boolean
    brandLook: boolean
  }
}

const INTL: Record<string, string> = { 'sr-Latn': 'sr-Latn-RS', en: 'en-GB', uk: 'uk-UA' }
const FORMAT_ICON: Record<PostFormat, typeof ImageIcon> = {
  carousel: GalleryHorizontalEnd,
  image: ImageIcon,
  video: Clapperboard,
  story: Smartphone,
  text: Type,
  link: Link2,
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000) + 1
}

/** Broj kalendarskih meseci od `start` do `end` (oba uključena). */
function monthsBetween(start: string, end: string): number {
  const [ys, ms] = start.split('-').map(Number) as [number, number]
  const [ye, me] = end.split('-').map(Number) as [number, number]
  return (ye - ys) * 12 + (me - ms) + 1
}

function weekStart(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  const shift = (d.getUTCDay() + 6) % 7
  return new Date(d.getTime() - shift * 86_400_000).toISOString().slice(0, 10)
}

export function MonthPlan({ brandId, canEdit }: { brandId: string; canEdit: boolean }) {
  const t = useTranslations('plan')
  const qc = useQueryClient()
  const key = ['plan', brandId]
  const page = useQuery({
    queryKey: key,
    queryFn: () => api<Page>(`/api/plans?brandId=${brandId}`),
    refetchInterval: (q) => {
      const s = q.state.data?.plan?.status
      return s === 'planning' || s === 'generating' ? 3000 : false
    },
  })
  const [setup, setSetup] = useState(false)
  const data = page.data
  const plan = data?.plan ?? null
  const showSetup = setup || !plan

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <p className="text-xs font-semibold tracking-wider text-primary uppercase">{t('eyebrow')}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {plan && !showSetup && canEdit && plan.status !== 'generating' && plan.status !== 'planning' ? (
          <Button variant="outline" onClick={() => setSetup(true)}>
            <Wand2 aria-hidden />
            {t('newPlan')}
          </Button>
        ) : null}
      </div>
      <ErrorBox error={page.error} />
      {page.isPending ? <div className="h-64 animate-pulse rounded-xl bg-muted" aria-hidden /> : null}

      {data && showSetup ? (
        <SetupCard
          brandId={brandId}
          options={data.options}
          canEdit={canEdit}
          replacing={Boolean(plan)}
          onCancel={plan ? () => setSetup(false) : undefined}
          onCreated={(created) => {
            qc.setQueryData<Page>(key, (cur) => (cur ? { ...cur, plan: created } : cur))
            setSetup(false)
          }}
        />
      ) : null}

      {data && plan && !showSetup ? (
        <PlanBoard
          plan={plan}
          options={data.options}
          canEdit={canEdit}
          onChange={(next) =>
            next === null
              ? void qc.invalidateQueries({ queryKey: key })
              : qc.setQueryData<Page>(key, (cur) => (cur ? { ...cur, plan: next } : cur))
          }
        />
      ) : null}
    </div>
  )
}

function SetupCard({
  brandId,
  options,
  canEdit,
  replacing,
  onCancel,
  onCreated,
}: {
  brandId: string
  options: Page['options']
  canEdit: boolean
  replacing: boolean
  onCancel?: () => void
  onCreated: (plan: Plan) => void
}) {
  const t = useTranslations('plan')
  const tl = useTranslations('contentLocale')
  const locale = useLocale()
  const monthName = new Intl.DateTimeFormat(INTL[locale] ?? 'sr-Latn-RS', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const dayMonth = new Intl.DateTimeFormat(INTL[locale] ?? 'sr-Latn-RS', {
    day: 'numeric',
    month: 'numeric',
    timeZone: 'UTC',
  })
  const current = options.months.find((m) => m.kind === 'current')
  const [kind, setKind] = useState<'current' | 'next'>(
    current && daysBetween(current.start, current.end) >= 7 ? 'current' : 'next',
  )
  const [months, setMonths] = useState(1)
  // izabran izgled brenda (D-123) je podrazumevan; bez njega plan je šaren
  const [look, setLook] = useState<'vivid' | 'brand'>(options.brandLook ? 'brand' : 'vivid')
  const [perWeek, setPerWeek] = useState(5)
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(options.platforms)
  const [formats, setFormats] = useState<PostFormat[]>([...POST_FORMATS])
  const [contentLocale, setContentLocale] = useState(options.locale)
  const [notes, setNotes] = useState('')
  const period = options.months.find((m) => m.kind === kind) ?? options.months[0]
  const periodEnd = period ? monthEnd(period.month, months) : null
  const slots =
    period && periodEnd
      ? buildSlots({ start: period.start, end: periodEnd, perWeek, formats, platforms })
      : []
  const estimate = slots.length
  // plan se plaća po mesecu u kom ima termina, isto kao na serveru
  const planCost = options.prices.plan * slotMonths(slots).length
  const usable = POST_FORMATS.filter((f) => platforms.some((p) => PLATFORM_FORMATS[p].includes(f)))

  const create = useMutation({
    mutationFn: () =>
      api<Plan>('/api/plans', {
        method: 'POST',
        json: {
          brandId,
          kind,
          months,
          look,
          perWeek,
          platforms,
          formats,
          locale: contentLocale,
          notes: notes.trim() || undefined,
        },
      }),
    onSuccess: onCreated,
  })
  const chip = (on: boolean) =>
    cn(
      'rounded-lg border px-3 py-2 text-sm',
      on ? 'border-primary bg-primary/10 text-primary' : 'bg-background hover:bg-muted',
    )

  if (!options.platforms.length)
    return (
      <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm">
        <p className="font-medium">{t('setup.noAccounts')}</p>
        <Link href="/app/accounts" className="mt-2 inline-block text-primary hover:underline">
          {t('setup.connect')}
        </Link>
      </div>
    )

  return (
    <section aria-label={t('setup.title')} className="space-y-5 rounded-xl border bg-card p-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('setup.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('setup.text')}</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('setup.month')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {options.months.map((m) => (
            <button
              key={m.kind}
              type="button"
              aria-pressed={kind === m.kind}
              onClick={() => setKind(m.kind)}
              className={cn(chip(kind === m.kind), 'text-left')}
            >
              <span className="block font-medium capitalize">
                {monthName.format(new Date(`${m.month}T12:00:00Z`))}
              </span>
              <span className="block text-xs text-muted-foreground">
                {m.kind === 'current'
                  ? t('setup.rest', { from: dayMonth.format(new Date(`${m.start}T12:00:00Z`)) })
                  : t('setup.whole')}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('setup.months')}</legend>
        <div className="flex flex-wrap gap-2">
          {MONTH_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={months === n}
              onClick={() => setMonths(n)}
              className={chip(months === n)}
            >
              {t('setup.monthsValue', { count: n })}
            </button>
          ))}
        </div>
        {period && periodEnd ? (
          <p className="text-xs text-muted-foreground">
            {t('setup.monthsHint', {
              from: dayMonth.format(new Date(`${period.start}T12:00:00Z`)),
              to: dayMonth.format(new Date(`${periodEnd}T12:00:00Z`)),
            })}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('setup.look')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['vivid', 'brand'] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={look === l}
              onClick={() => setLook(l)}
              className={cn(chip(look === l), 'text-left')}
            >
              <span className="block font-medium">{t(`setup.looks.${l}`)}</span>
              <span className="block text-xs text-muted-foreground">{t(`setup.looks.${l}Hint`)}</span>
            </button>
          ))}
        </div>
        {look === 'brand' ? (
          <p className="text-xs text-muted-foreground">
            <Link href="/app/brand/visual" className="text-primary hover:underline">
              {t('setup.looks.change')}
            </Link>
          </p>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('setup.perWeek')}</legend>
        <div className="flex flex-wrap gap-2">
          {PER_WEEK_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={perWeek === n}
              onClick={() => setPerWeek(n)}
              className={chip(perWeek === n)}
            >
              {t('setup.perWeekValue', { n })}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('setup.networks')}</legend>
        <div className="flex flex-wrap gap-2">
          {options.platforms.map((p) => {
            const on = platforms.includes(p)
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                disabled={on && platforms.length === 1}
                onClick={() => setPlatforms((cur) => (on ? cur.filter((x) => x !== p) : [...cur, p]))}
                className={chip(on)}
              >
                {PLATFORMS[p].label}
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="flex w-full items-center justify-between gap-2 text-sm font-medium">
          {t('setup.formats')}
          <button
            type="button"
            className="text-xs font-normal text-primary hover:underline"
            onClick={() => setFormats([...POST_FORMATS])}
          >
            {t('setup.allFormats')}
          </button>
        </legend>
        <div className="flex flex-wrap gap-2">
          {POST_FORMATS.map((f) => {
            const on = formats.includes(f)
            const Icon = FORMAT_ICON[f]
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                disabled={(on && formats.length === 1) || !usable.includes(f)}
                onClick={() => setFormats((cur) => (on ? cur.filter((x) => x !== f) : [...cur, f]))}
                className={cn(chip(on), 'inline-flex items-center gap-1.5 disabled:opacity-40')}
              >
                <Icon className="size-4" aria-hidden />
                {t(`formats.${f}`)}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">{t('setup.formatsHint')}</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor="plan-locale">{t('setup.locale')}</Label>
          <select
            id="plan-locale"
            value={contentLocale}
            onChange={(e) => setContentLocale(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {CONTENT_LOCALES.map((l) => (
              <option key={l} value={l}>
                {tl(l)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-notes">{t('setup.notes')}</Label>
          <Textarea
            id="plan-notes"
            rows={2}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('setup.notesPlaceholder')}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-4 py-3">
        <p className="text-sm">
          {t('setup.estimate', {
            count: estimate,
            plan: planCost,
            posts: estimate * options.prices.post,
          })}{' '}
          <span className="text-muted-foreground">{t('setup.balance', { count: options.balance })}</span>
        </p>
        <div className="flex gap-2">
          {onCancel ? (
            <Button variant="outline" onClick={onCancel}>
              {t('setup.cancel')}
            </Button>
          ) : null}
          <Button
            disabled={!canEdit || !estimate || create.isPending}
            onClick={() => (!replacing || window.confirm(t('setup.replaceConfirm'))) && create.mutate()}
          >
            {create.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Wand2 aria-hidden />}
            {t('setup.create')}
          </Button>
        </div>
      </div>
      <ErrorBox error={create.error} />
    </section>
  )
}

function PlanBoard({
  plan,
  options,
  canEdit,
  onChange,
}: {
  plan: Plan
  options: Page['options']
  canEdit: boolean
  onChange: (plan: Plan | null) => void
}) {
  const t = useTranslations('plan')
  const locale = useLocale()
  const intl = INTL[locale] ?? 'sr-Latn-RS'
  const day = new Intl.DateTimeFormat(intl, {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    timeZone: 'UTC',
  })
  const short = new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'numeric', timeZone: 'UTC' })
  const monthName = new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const [mode, setMode] = useState<'review' | 'schedule'>('review')
  const [editing, setEditing] = useState<Item | null>(null)
  const editable = canEdit && (plan.status === 'ready' || plan.status === 'done' || plan.status === 'failed')
  const pendingIds = plan.items
    .filter((i) => i.status === 'planned' || i.status === 'failed')
    .map((i) => i.id)
  const selection = useSelection(
    editable ? plan.items.filter((i) => i.status !== 'done').map((i) => i.id) : [],
  )

  const remove = useMutation({
    mutationFn: (ids: string[]) =>
      api<Plan>(`/api/plans/${plan.id}/items/delete`, { method: 'POST', json: { ids } }),
    onSuccess: (next) => {
      selection.clear()
      onChange(next)
    },
  })
  const generate = useMutation({
    mutationFn: () => api<Plan>(`/api/plans/${plan.id}/generate`, { method: 'POST', json: { mode } }),
    onSuccess: onChange,
  })
  const drop = useMutation({
    mutationFn: () => api(`/api/plans/${plan.id}`, { method: 'DELETE' }),
    onSuccess: () => onChange(null),
  })

  const weeks = new Map<string, Item[]>()
  for (const i of plan.items) weeks.set(weekStart(i.date), [...(weeks.get(weekStart(i.date)) ?? []), i])
  // plan za više meseci: naslov meseca iznad njegovih nedelja, nedelje se broje u okviru meseca
  const monthCount = monthsBetween(plan.periodStart, plan.periodEnd)
  const groups: Array<{ start: string; items: Item[]; month: string | null; n: number }> = []
  for (const [start, items] of weeks) {
    const month = items[0]!.date.slice(0, 7)
    const prev = groups.at(-1)
    const sameMonth = prev && prev.items[0]!.date.slice(0, 7) === month
    groups.push({
      start,
      items,
      month: monthCount > 1 && !sameMonth ? month : null,
      n: monthCount > 1 && !sameMonth ? 1 : (prev?.n ?? 0) + 1,
    })
  }
  const plannedMonths = new Set(plan.items.map((i) => i.date.slice(0, 7))).size
  const title =
    monthCount > 1
      ? `${monthName.format(new Date(`${plan.periodStart}T12:00:00Z`))} – ${monthName.format(new Date(`${plan.periodEnd}T12:00:00Z`))}`
      : monthName.format(new Date(`${plan.month}T12:00:00Z`))
  const total = plan.items.length
  const finished = plan.counts.done + plan.counts.failed
  const formatsCount = POST_FORMATS.map(
    (f) => [f, plan.items.filter((i) => i.format === f).length] as const,
  ).filter(([, n]) => n)

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-lg font-semibold capitalize">
              <CalendarRange className="size-5 text-primary" aria-hidden />
              {title}
            </p>
            <p className="text-sm text-muted-foreground">
              {/* dok Sova bira teme, broj objava još ne postoji */}
              {t(total ? 'board.summary' : 'board.period', {
                count: total,
                from: short.format(new Date(`${plan.periodStart}T12:00:00Z`)),
                to: short.format(new Date(`${plan.periodEnd}T12:00:00Z`)),
              })}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {formatsCount.map(([f, n]) => {
                const Icon = FORMAT_ICON[f]
                return (
                  <span
                    key={f}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {t(`formats.${f}`)} · {n}
                  </span>
                )
              })}
            </div>
          </div>
          {editable && pendingIds.length ? (
            <div className="space-y-2 text-right">
              {options.canSchedule ? (
                <div
                  className="flex flex-wrap justify-end gap-1"
                  role="radiogroup"
                  aria-label={t('board.mode')}
                >
                  {(['review', 'schedule'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={mode === m}
                      onClick={() => setMode(m)}
                      className={cn(
                        'rounded-md border px-2.5 py-1 text-xs',
                        mode === m ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
                      )}
                    >
                      {t(`board.modes.${m}`)}
                    </button>
                  ))}
                </div>
              ) : null}
              <Button size="lg" disabled={generate.isPending} onClick={() => generate.mutate()}>
                {generate.isPending ? (
                  <LoaderCircle className="animate-spin" aria-hidden />
                ) : (
                  <Wand2 aria-hidden />
                )}
                {t(plan.counts.failed && plan.counts.done ? 'board.retry' : 'board.generate', {
                  count: pendingIds.length,
                  tokens: pendingIds.length * options.prices.post,
                })}
              </Button>
              <p className="text-xs text-muted-foreground">{t(`board.modeHint.${mode}`)}</p>
            </div>
          ) : null}
        </div>

        {plan.status === 'planning' ? (
          <p role="status" className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            {monthCount > 1
              ? t('board.planningMonths', { done: plannedMonths, total: monthCount })
              : t('board.planning')}
          </p>
        ) : null}
        {plan.status === 'generating' ? (
          <div role="status" className="space-y-1.5 rounded-lg bg-primary/5 px-3 py-2">
            <p className="flex items-center gap-2 text-sm">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              {t('board.generating', { done: finished, total })}
            </p>
            <div className="h-1.5 rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-primary transition-[width]"
                style={{ width: `${total ? Math.round((finished / total) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('board.background')}</p>
          </div>
        ) : null}
        {plan.status === 'failed' && !total ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t('board.failed', { error: plan.error ?? '' })}
          </p>
        ) : null}
        {plan.error && total && plan.status !== 'planning' && plan.status !== 'generating' ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            {t('board.partial', { error: plan.error })}
          </p>
        ) : null}
        {plan.counts.done && plan.status !== 'generating' ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:bg-emerald-500/10 dark:text-emerald-100">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="size-4" aria-hidden />
              {t(plan.settings.mode === 'schedule' ? 'board.doneScheduled' : 'board.doneReview', {
                count: plan.counts.done,
              })}
              {plan.counts.failed ? ` ${t('board.someFailed', { count: plan.counts.failed })}` : ''}
            </span>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href={plan.settings.mode === 'schedule' ? '/app/calendar' : '/app/approvals'} />}
            >
              {t(plan.settings.mode === 'schedule' ? 'board.openCalendar' : 'board.openApprovals')}
            </Button>
          </div>
        ) : null}
        <ErrorBox error={generate.error ?? remove.error ?? drop.error} />
      </section>

      {total ? (
        <section aria-label={t('board.list')} className="rounded-xl border bg-card">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            {editable ? (
              <SelectAllBox selection={selection} />
            ) : (
              <span className="text-sm font-medium">{t('board.list')}</span>
            )}
            {editable ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={drop.isPending}
                onClick={() => window.confirm(t('board.deletePlanConfirm')) && drop.mutate()}
              >
                <Trash2 aria-hidden />
                {t('board.deletePlan')}
              </Button>
            ) : null}
          </header>
          {groups.map(({ start, items, month, n }) => (
            <div key={start}>
              {month ? (
                <p className="border-b px-4 pt-4 pb-2 text-sm font-semibold capitalize">
                  {monthName.format(new Date(`${month}-01T12:00:00Z`))}
                </p>
              ) : null}
              <p className="bg-muted/40 px-4 py-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {t('board.week', {
                  n,
                  range: [...new Set([items[0]!.date, items[items.length - 1]!.date])]
                    .map((d) => short.format(new Date(`${d}T12:00:00Z`)))
                    .join(' – '),
                })}
              </p>
              <ul className="divide-y">
                {items.map((i) => {
                  const Icon = FORMAT_ICON[i.format]
                  return (
                    <li
                      key={i.id}
                      className={cn('flex gap-3 px-4 py-3', selection.has(i.id) && 'bg-primary/5')}
                    >
                      {editable && i.status !== 'done' ? (
                        <SelectBox selection={selection} id={i.id} label={i.topic} className="mt-1" />
                      ) : (
                        <span className="mt-0.5 size-4 shrink-0" aria-hidden>
                          {i.status === 'done' ? <CheckCircle2 className="size-4 text-emerald-600" /> : null}
                          {i.status === 'failed' ? <XCircle className="size-4 text-destructive" /> : null}
                          {i.status === 'generating' ? (
                            <LoaderCircle className="size-4 animate-spin text-primary" />
                          ) : null}
                        </span>
                      )}
                      <div className="hidden w-24 shrink-0 text-xs sm:block">
                        <p className="font-medium capitalize">
                          {day.format(new Date(`${i.date}T12:00:00Z`))}
                        </p>
                        <p className="text-muted-foreground">{i.time}</p>
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        {/* na telefonu termin ide iznad teme, da tema dobije celu širinu */}
                        <p className="text-xs font-medium capitalize sm:hidden">
                          {day.format(new Date(`${i.date}T12:00:00Z`))} · {i.time}
                        </p>
                        <p className="font-medium">{i.topic}</p>
                        {i.brief ? (
                          <p className="line-clamp-2 text-sm text-muted-foreground">{i.brief}</p>
                        ) : null}
                        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                            <Icon className="size-3.5" aria-hidden />
                            {t(`formats.${i.format}`)}
                          </span>
                          <span>{i.platforms.map((p) => PLATFORMS[p].label).join(' · ')}</span>
                          {[
                            ...new Set(
                              [i.pillar, t(`goals.${i.goal}` as 'goals.engagement')].filter(
                                (v): v is string => !!v,
                              ),
                            ),
                          ].map((v) => (
                            <span key={v}>· {v}</span>
                          ))}
                        </p>
                        {i.status === 'failed' && i.error ? (
                          <p className="text-xs text-destructive">{i.error}</p>
                        ) : null}
                        {i.status === 'done' && i.postId ? (
                          <Link
                            href={`/app/posts/${i.postId}`}
                            className="text-xs text-primary hover:underline"
                          >
                            {t('board.openPost')}
                          </Link>
                        ) : null}
                      </div>
                      {editable && i.status !== 'done' ? (
                        <div className="flex shrink-0 items-start gap-1">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t('board.edit', { topic: i.topic })}
                            onClick={() => setEditing(i)}
                          >
                            <Pencil aria-hidden />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-destructive"
                            aria-label={t('board.delete', { topic: i.topic })}
                            disabled={remove.isPending}
                            onClick={() => remove.mutate([i.id])}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      <BulkBar selection={selection}>
        <Button
          size="sm"
          variant="destructive"
          disabled={remove.isPending}
          onClick={() =>
            window.confirm(t('board.deleteSelectedConfirm', { count: selection.count })) &&
            remove.mutate([...selection.selected])
          }
        >
          <Trash2 aria-hidden />
          {t('board.deleteSelected')}
        </Button>
      </BulkBar>

      {editing ? (
        <EditItem
          item={editing}
          plan={plan}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            setEditing(null)
            onChange(next)
          }}
        />
      ) : null}
      {plan.status === 'planning' ? (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="size-4 animate-spin" aria-hidden />
          {t('board.refreshing')}
        </p>
      ) : null}
    </div>
  )
}

function EditItem({
  item,
  plan,
  onClose,
  onSaved,
}: {
  item: Item
  plan: Plan
  onClose: () => void
  onSaved: (plan: Plan) => void
}) {
  const t = useTranslations('plan')
  const [topic, setTopic] = useState(item.topic)
  const [brief, setBrief] = useState(item.brief)
  const [format, setFormat] = useState<PostFormat>(item.format)
  const [date, setDate] = useState(item.date)
  const [time, setTime] = useState(item.time)
  const formats = POST_FORMATS.filter((f) =>
    plan.settings.platforms.some((p) => PLATFORM_FORMATS[p].includes(f)),
  )
  const save = useMutation({
    mutationFn: () =>
      api<Plan>(`/api/plans/${plan.id}/items/${item.id}`, {
        method: 'PATCH',
        json: { topic, brief, format, date, time },
      }),
    onSuccess: onSaved,
  })
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('edit.title')}</DialogTitle>
          <DialogDescription>{t('edit.description')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="plan-topic">{t('edit.topic')}</Label>
            <Input id="plan-topic" value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-brief">{t('edit.brief')}</Label>
            <Textarea
              id="plan-brief"
              rows={4}
              maxLength={1000}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="plan-format">{t('edit.format')}</Label>
              <select
                id="plan-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as PostFormat)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {formats.map((f) => (
                  <option key={f} value={f}>
                    {t(`formats.${f}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-date">{t('edit.date')}</Label>
              <Input
                id="plan-date"
                type="date"
                min={plan.periodStart}
                max={plan.periodEnd}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-time">{t('edit.time')}</Label>
              <Input id="plan-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <ErrorBox error={save.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('edit.cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending || topic.trim().length < 3}>
              {save.isPending ? t('edit.saving') : t('edit.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
