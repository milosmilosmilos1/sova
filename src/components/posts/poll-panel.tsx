'use client'

import { Plus, X as Remove } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { POLL_DURATIONS, POLL_LIMITS, type PollOptions } from '@/config/poll'

/**
 * Anketa za LinkedIn i X (D-151): pitanje, 2 do 4 odgovora i trajanje. Ista anketa ide na sve
 * izabrane LinkedIn i X naloge; objava sa anketom ide bez slike.
 */
export function PollPanel({
  value,
  onChange,
  hasMedia,
  disabled,
}: {
  value: PollOptions | null
  onChange: (next: PollOptions | null) => void
  hasMedia: boolean
  disabled: boolean
}) {
  const t = useTranslations('postPanels')
  const set = (patch: Partial<PollOptions>) => value && onChange({ ...value, ...patch })
  const setOption = (i: number, text: string) =>
    value && set({ options: value.options.map((o, k) => (k === i ? text : o)) })
  return (
    <div className="space-y-3 rounded-md border p-3 text-sm">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(e) =>
            onChange(e.target.checked ? { question: '', options: ['', ''], durationDays: 3 } : null)
          }
        />
        <span>
          <span className="font-medium">{t('poll.toggle')}</span>
          <span className="block text-xs text-muted-foreground">{t('poll.hint')}</span>
        </span>
      </label>
      {value ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="poll-question">{t('poll.question')}</Label>
            <Input
              id="poll-question"
              maxLength={POLL_LIMITS.question}
              value={value.question}
              disabled={disabled}
              onChange={(e) => set({ question: e.target.value })}
            />
          </div>
          <fieldset className="space-y-2" disabled={disabled}>
            <legend className="text-sm font-medium">{t('poll.options')}</legend>
            {value.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  aria-label={t('poll.optionLabel', { n: i + 1 })}
                  maxLength={POLL_LIMITS.option.linkedin}
                  value={o}
                  onChange={(e) => setOption(i, e.target.value)}
                />
                {value.options.length > POLL_LIMITS.minOptions ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('poll.remove', { n: i + 1 })}
                    onClick={() => set({ options: value.options.filter((_, k) => k !== i) })}
                  >
                    <Remove aria-hidden />
                  </Button>
                ) : null}
              </div>
            ))}
            {value.options.length < POLL_LIMITS.maxOptions ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => set({ options: [...value.options, ''] })}
              >
                <Plus aria-hidden />
                {t('poll.add')}
              </Button>
            ) : null}
            <p className="text-xs text-muted-foreground">{t('poll.optionHint')}</p>
          </fieldset>
          <div className="space-y-1">
            <Label htmlFor="poll-duration">{t('poll.duration')}</Label>
            <select
              id="poll-duration"
              value={value.durationDays}
              disabled={disabled}
              onChange={(e) => set({ durationDays: Number(e.target.value) as PollOptions['durationDays'] })}
              className="h-9 w-full rounded-md border border-input bg-background px-2 sm:w-56"
            >
              {POLL_DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {t('poll.days', { n: d })}
                </option>
              ))}
            </select>
            {value.durationDays > 7 ? (
              <p className="text-xs text-muted-foreground">{t('poll.xMax')}</p>
            ) : null}
          </div>
          {hasMedia ? <p className="text-xs text-muted-foreground">{t('poll.media')}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
