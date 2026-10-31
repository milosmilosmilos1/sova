'use client'

import { CalendarClock, LoaderCircle } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { INTL_LOCALE, toContentLocale } from '@/config/locales'
import { cn } from '@/lib/utils'
import { wallClock, zonedToUtc } from '@/lib/zoned-time'

/**
 * Masovno zakazivanje iz Odobravanja (D-127): označeni nacrti idu u svoje termine iz plana, ili ih
 * Sova raspoređuje od izabranog datuma u isti sat na svakih nekoliko dana. Nacrti koji čekaju se
 * odobravaju kao kod „Sačuvaj i zakaži”, a termin se računa u zoni brenda. Prozor se pravi pri
 * svakom otvaranju, pa je „sada” uvek sveže.
 */
const EVERY = [1, 2, 3, 7] as const
type Every = (typeof EVERY)[number]

/** Datum (YYYY-MM-DD) pomeren za `days` kalendarskih dana. */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10)
}

export interface ScheduleItem {
  id: string
  scheduledFor: string | null
}

export function BulkScheduleDialog({
  items,
  timeZone,
  pending,
  onClose,
  onConfirm,
}: {
  /** označeni nacrti redom kao u listi */
  items: ScheduleItem[]
  timeZone: string
  pending: boolean
  onClose: () => void
  onConfirm: (input: { ids: string[]; at?: Record<string, string> }) => void
}) {
  const t = useTranslations('bulk')
  const tc = useTranslations('common')
  const locale = useLocale()
  const [now] = useState(() => Date.now())
  const planned = items
    .filter((i) => i.scheduledFor && Date.parse(i.scheduledFor) > now + 60_000)
    .sort((a, b) => Date.parse(a.scheduledFor!) - Date.parse(b.scheduledFor!))
  // raspored ide redom kao plan; nacrti bez termina na kraju, redom kao u listi
  const order = [...planned, ...items.filter((i) => !planned.includes(i))]
  const [mode, setMode] = useState<'plan' | 'spread'>(planned.length ? 'plan' : 'spread')
  const [date, setDate] = useState(() => wallClock(new Date(now + 86_400_000).toISOString(), timeZone).date)
  const [time, setTime] = useState(() =>
    planned[0] ? wallClock(planned[0].scheduledFor!, timeZone).time : '10:00',
  )
  const [every, setEvery] = useState<Every>(1)

  const fmt = new Intl.DateTimeFormat(INTL_LOCALE[toContentLocale(locale)], {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const at = (iso: string) => fmt.format(new Date(iso))
  const spread =
    date && time
      ? order.map((item, i) => [item.id, zonedToUtc(addDays(date, i * every), time, timeZone)])
      : []
  const spreadPast = !spread.length || Date.parse(spread[0]![1]!) <= now + 60_000
  const count = mode === 'plan' ? planned.length : items.length
  const ready = mode === 'plan' ? planned.length > 0 : !spreadPast

  const option = (value: 'plan' | 'spread', title: string, text: string) => (
    <label
      className={cn(
        'block cursor-pointer rounded-lg border p-3 hover:bg-muted/50',
        mode === value && 'border-primary ring-2 ring-primary/30',
      )}
    >
      <input
        type="radio"
        name="bulk-schedule-mode"
        value={value}
        checked={mode === value}
        onChange={() => setMode(value)}
        className="sr-only"
      />
      <span className="block font-medium">{title}</span>
      <span className="block text-xs text-muted-foreground">{text}</span>
    </label>
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('scheduleTitle', { count: items.length })}</DialogTitle>
          <DialogDescription>{t('scheduleHint', { tz: timeZone })}</DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="sr-only">{t('schedule')}</legend>
          {option(
            'plan',
            t('schedulePlan'),
            planned.length
              ? t('schedulePlanHint', {
                  first: at(planned[0]!.scheduledFor!),
                  last: at(planned.at(-1)!.scheduledFor!),
                })
              : t('schedulePlanNone'),
          )}
          {option('spread', t('scheduleSpread'), t('scheduleSpreadText'))}
        </fieldset>

        {mode === 'plan' && planned.length > 0 && planned.length < items.length ? (
          <p className="text-xs text-muted-foreground">
            {t('schedulePlanMissing', { count: items.length - planned.length })}
          </p>
        ) : null}

        {mode === 'spread' ? (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <div className="min-w-0 space-y-1">
                <Label htmlFor="bulk-schedule-date">{t('scheduleDate')}</Label>
                <Input
                  id="bulk-schedule-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="min-w-0 space-y-1">
                <Label htmlFor="bulk-schedule-time">{t('scheduleTime')}</Label>
                <Input
                  id="bulk-schedule-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bulk-schedule-every">{t('scheduleEvery')}</Label>
              <select
                id="bulk-schedule-every"
                value={every}
                onChange={(e) => setEvery(Number(e.target.value) as Every)}
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
              >
                {EVERY.map((d) => (
                  <option key={d} value={d}>
                    {t(`every${d}`)}
                  </option>
                ))}
              </select>
            </div>
            <p
              role="status"
              className={cn('text-xs', spreadPast ? 'text-destructive' : 'text-muted-foreground')}
            >
              {spreadPast
                ? t('schedulePast')
                : t('scheduleSpreadHint', { first: at(spread[0]![1]!), last: at(spread.at(-1)![1]!) })}
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button
            disabled={pending || !ready}
            onClick={() =>
              onConfirm(
                mode === 'plan'
                  ? { ids: planned.map((i) => i.id) }
                  : { ids: order.map((i) => i.id), at: Object.fromEntries(spread) },
              )
            }
          >
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <CalendarClock aria-hidden />}
            {t('scheduleConfirm', { count })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
