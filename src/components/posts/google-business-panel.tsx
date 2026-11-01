'use client'

import { useTranslations } from 'next-intl'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { GBP_ACTIONS, GBP_TOPICS, gbpOptionProblems, type GbpOptions } from '@/config/google-business'

/**
 * Poruke iz `gbpOptionProblems` (deljene sa serverom, u kodu ostaju srpske, D-130) → ključ prevoda.
 * Poruka koje nema u spisku prikazuje se kakva jeste.
 */
const PROBLEM_KEYS: Record<string, 'ctaLink' | 'title' | 'dates' | 'endAfterStart'> = {
  'Dugme na Google poslovnom profilu traži link: upišite link objave ili adresu dugmeta.': 'ctaLink',
  'Događaj i ponuda na Google poslovnom profilu traže naslov.': 'title',
  'Događaj i ponuda traže početak i kraj (datum i sat).': 'dates',
  'Kraj događaja mora biti posle početka.': 'endAfterStart',
}

/**
 * Podešavanja objave na Google poslovnom profilu (faza 8c): vrsta objave, dugme i, za događaj i
 * ponudu, naslov i trajanje po lokalnom vremenu lokacije. Problemi se prikazuju odmah, pre zakazivanja.
 */
export function GoogleBusinessPanel({
  accountId,
  value,
  postLink,
  onChange,
  disabled,
}: {
  accountId: string
  value: GbpOptions
  postLink: string | null
  onChange: (next: GbpOptions) => void
  disabled: boolean
}) {
  const t = useTranslations('postPanels.gbp')
  const set = (patch: Partial<GbpOptions>) => onChange({ ...value, ...patch })
  const id = (name: string) => `gbp-${name}-${accountId}`
  const timed = value.topicType !== 'STANDARD'
  const problems = gbpOptionProblems(value, postLink)
  return (
    <div className="mt-3 space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={id('topic')}>{t('topic')}</Label>
          <select
            id={id('topic')}
            value={value.topicType}
            disabled={disabled}
            onChange={(e) => set({ topicType: e.target.value as GbpOptions['topicType'] })}
            className="h-9 w-full rounded-md border border-input bg-background px-2"
          >
            {GBP_TOPICS.map((topic) => (
              <option key={topic} value={topic}>
                {t(`topics.${topic}`)}
              </option>
            ))}
          </select>
        </div>
        {value.topicType !== 'OFFER' ? (
          <div className="space-y-1">
            <Label htmlFor={id('action')}>{t('button')}</Label>
            <select
              id={id('action')}
              value={value.actionType}
              disabled={disabled}
              onChange={(e) => set({ actionType: e.target.value as GbpOptions['actionType'] })}
              className="h-9 w-full rounded-md border border-input bg-background px-2"
            >
              {GBP_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {t(`actions.${a}`)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      {value.topicType !== 'OFFER' && value.actionType !== 'NONE' && value.actionType !== 'CALL' ? (
        <div className="space-y-1">
          <Label htmlFor={id('url')}>{t('buttonUrl')}</Label>
          <Input
            id={id('url')}
            type="url"
            placeholder={postLink ? t('emptyIsPostLink') : 'https://'}
            value={value.ctaUrl ?? ''}
            disabled={disabled}
            onChange={(e) => set({ ctaUrl: e.target.value || null })}
          />
        </div>
      ) : null}
      {value.actionType === 'CALL' && value.topicType !== 'OFFER' ? (
        <p className="text-xs text-muted-foreground">{t('callHint')}</p>
      ) : null}
      {timed ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-3">
            <Label htmlFor={id('title')}>
              {value.topicType === 'OFFER' ? t('titleOffer') : t('titleEvent')}
            </Label>
            <Input
              id={id('title')}
              maxLength={58}
              value={value.eventTitle ?? ''}
              disabled={disabled}
              onChange={(e) => set({ eventTitle: e.target.value || null })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={id('start')}>{t('start')}</Label>
            <Input
              id={id('start')}
              type="datetime-local"
              value={value.eventStart ?? ''}
              disabled={disabled}
              onChange={(e) => set({ eventStart: e.target.value || null })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={id('end')}>{t('end')}</Label>
            <Input
              id={id('end')}
              type="datetime-local"
              value={value.eventEnd ?? ''}
              disabled={disabled}
              onChange={(e) => set({ eventEnd: e.target.value || null })}
            />
          </div>
        </div>
      ) : null}
      {value.topicType === 'OFFER' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={id('coupon')}>{t('coupon')}</Label>
            <Input
              id={id('coupon')}
              maxLength={58}
              value={value.couponCode ?? ''}
              disabled={disabled}
              onChange={(e) => set({ couponCode: e.target.value || null })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={id('redeem')}>{t('redeemUrl')}</Label>
            <Input
              id={id('redeem')}
              type="url"
              placeholder={postLink ? t('emptyIsPostLink') : 'https://'}
              value={value.redeemUrl ?? ''}
              disabled={disabled}
              onChange={(e) => set({ redeemUrl: e.target.value || null })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={id('terms')}>{t('terms')}</Label>
            <Textarea
              id={id('terms')}
              rows={2}
              value={value.terms ?? ''}
              disabled={disabled}
              onChange={(e) => set({ terms: e.target.value || null })}
            />
          </div>
        </div>
      ) : null}
      {timed ? <p className="text-xs text-muted-foreground">{t('localTime')}</p> : null}
      {problems.length ? (
        <ul className="list-disc pl-5 text-xs text-amber-800" role="status">
          {problems.map((p) => {
            const key = PROBLEM_KEYS[p]
            return <li key={p}>{key ? t(`problems.${key}`) : p}</li>
          })}
        </ul>
      ) : null}
    </div>
  )
}
