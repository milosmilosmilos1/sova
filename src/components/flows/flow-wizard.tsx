'use client'

import { useMutation } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { CONTENT_LOCALES } from '@/config/locales'
import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { PLATFORM_FORMATS, type PostFormat } from '@/config/post-formats'
import { PHOTO_SOURCES, type PhotoSource, type PostSize, type StyleId } from '@/lib/visuals/design/catalog'
import type { DesignColors } from '@/lib/visuals/design/types'
import { cn } from '@/lib/utils'

import { dayKey } from './flows-client'

type FlowFormat = 'carousel' | 'single' | 'story'

export interface WizardFlow {
  id: string
  name: string
  topic: string
  cta: string | null
  ctaMode: 'none' | 'dm'
  format: FlowFormat
  styleId: StyleId | null
  slides: number | null
  photoSource: PhotoSource | null
  galleryCategoryId: string | null
  locale: string | null
  autoAccounts: boolean
  accountIds: string[]
  days: number[]
  timeLocal: string
  autoTime: boolean
  collaborators: string[]
  active: boolean
}

export interface WizardAccount {
  id: string
  platform: SocialPlatform
  name: string
  username: string | null
}

const POST_FORMAT: Record<FlowFormat, PostFormat> = { carousel: 'carousel', single: 'image', story: 'story' }
const WEEK = [1, 2, 3, 4, 5, 6, 0]

/**
 * Čarobnjak toka u tri koraka (D-108): tema, format i stil, raspored. Isti obrazac za nov tok i
 * izmenu; čuva se tek na poslednjem koraku.
 */
export function FlowWizard({
  brandId,
  timeZone,
  flow,
  accounts,
  design,
  galleryCategories,
  canEdit,
}: {
  brandId: string
  timeZone: string
  flow: WizardFlow | null
  accounts: WizardAccount[]
  design: { styleId: StyleId; size: PostSize; photoSource: PhotoSource; slides: number; colors: DesignColors }
  /** kategorije galerije (D-114) za tok koji uzima fotografije iz galerije */
  galleryCategories: Array<{ id: string; name: string; count: number }>
  canEdit: boolean
}) {
  const t = useTranslations('flows.wizard')
  const tf = useTranslations('flows')
  const td = useTranslations('design')
  const tl = useTranslations('contentLocale')
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [name, setName] = useState(flow?.name ?? '')
  const [topic, setTopic] = useState(flow?.topic ?? '')
  const [cta, setCta] = useState(flow?.cta ?? '')
  const [format, setFormat] = useState<FlowFormat>(flow?.format ?? 'carousel')
  const [slides, setSlides] = useState<number>(flow?.slides ?? design.slides)
  const [photoSource, setPhotoSource] = useState<PhotoSource | null>(flow?.photoSource ?? null)
  const [galleryCategoryId, setGalleryCategoryId] = useState<string | null>(flow?.galleryCategoryId ?? null)
  const fromGallery = (photoSource ?? design.photoSource) === 'gallery'
  const [locale, setLocale] = useState<string | null>(flow?.locale ?? null)
  const [autoAccounts, setAutoAccounts] = useState(flow?.autoAccounts ?? true)
  const [accountIds, setAccountIds] = useState<string[]>(flow?.accountIds ?? [])
  const [days, setDays] = useState<number[]>(flow?.days ?? [1, 3, 5])
  const [timeLocal, setTimeLocal] = useState(flow?.timeLocal ?? '10:00')
  const [autoTime, setAutoTime] = useState(flow?.autoTime ?? false)
  const [collaborators, setCollaborators] = useState<string[]>(flow?.collaborators ?? [])
  const [collabInput, setCollabInput] = useState('')
  const [active, setActive] = useState(flow?.active ?? true)

  const postFormat = POST_FORMAT[format]
  const supports = (a: WizardAccount) => PLATFORM_FORMATS[a.platform]?.includes(postFormat)
  const slidesMin = format === 'carousel' ? 3 : 1
  const slidesMax = format === 'carousel' ? 10 : 5
  const slidesValue = Math.min(slidesMax, Math.max(slidesMin, slides))
  const hasInstagram = accounts.some(
    (a) => a.platform === 'instagram' && (autoAccounts || accountIds.includes(a.id)),
  )
  const step1Ok = name.trim().length > 0 && topic.trim().length >= 3
  const step3Ok = days.length > 0 && (autoAccounts || accountIds.length > 0)

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        topic: topic.trim(),
        cta: cta.trim() || null,
        ctaMode: 'none' as const,
        format,
        // stil je tema brenda (D-125); tok ne čuva svoj
        styleId: null,
        slides: format === 'single' ? null : slidesValue,
        photoSource,
        galleryCategoryId: fromGallery ? galleryCategoryId : null,
        locale,
        autoAccounts,
        accountIds: autoAccounts ? [] : accountIds,
        days,
        timeLocal,
        autoTime,
        collaborators: format === 'story' ? [] : collaborators,
        active,
      }
      return flow
        ? api(`/api/flows/${flow.id}`, { method: 'PATCH', json: body })
        : api('/api/flows', { method: 'POST', json: { brandId, ...body } })
    },
    onSuccess: () => {
      router.push('/app/flows')
      router.refresh()
    },
  })

  const option = (selected: boolean) =>
    cn(
      'flex-1 rounded-lg border p-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60',
      selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50',
    )
  const stepNames = ['topic', 'style', 'schedule'] as const

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <Link href="/app/flows" className="text-sm text-primary hover:underline">
          ← {t('backToList')}
        </Link>
        <p className="text-xs font-semibold tracking-wider text-primary uppercase">
          {t('stepOf', { n: step })} · {t(`steps.${stepNames[step - 1]}`)}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{flow ? t('editTitle') : t('newTitle')}</h1>
      </div>

      <ol className="grid gap-2 sm:grid-cols-3">
        {stepNames.map((s, i) => {
          const n = i + 1
          const reachable = n === 1 || (n === 2 && step1Ok) || (n === 3 && step1Ok)
          return (
            <li key={s}>
              <button
                type="button"
                disabled={!reachable}
                onClick={() => setStep(n)}
                aria-current={step === n ? 'step' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border p-3 text-left',
                  step === n ? 'border-primary bg-primary/5' : 'bg-card',
                )}
              >
                <span
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-lg text-xs font-semibold',
                    step > n
                      ? 'bg-primary/15 text-primary'
                      : step === n
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted',
                  )}
                >
                  {step > n ? <Check className="size-4" aria-hidden /> : n}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{t(`steps.${s}`)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t(`steps.${s}Hint`)}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <Card>
        <CardContent className="space-y-6 pt-6">
          {step === 1 ? (
            <>
              <p className="text-sm text-muted-foreground">{t('topicIntro')}</p>
              <div className="space-y-1.5">
                <Label htmlFor="flow-name">{t('name')}</Label>
                <Input
                  id="flow-name"
                  value={name}
                  maxLength={80}
                  placeholder={t('namePlaceholder')}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flow-topic">{t('topic')}</Label>
                <Textarea
                  id="flow-topic"
                  rows={3}
                  value={topic}
                  maxLength={2000}
                  placeholder={t('topicPlaceholder')}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flow-cta">{t('cta')}</Label>
                <Input
                  id="flow-cta"
                  value={cta}
                  maxLength={300}
                  placeholder={t('ctaPlaceholder')}
                  onChange={(e) => setCta(e.target.value)}
                />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t('ctaMode')}</legend>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button type="button" disabled className={option(false)} aria-disabled>
                    <span className="block font-medium">{t('ctaDm')}</span>
                    <span className="block text-xs text-muted-foreground">{t('ctaDmHint')}</span>
                  </button>
                  <button type="button" className={option(true)} aria-pressed>
                    <span className="block font-medium">{t('ctaNone')}</span>
                    <span className="block text-xs text-muted-foreground">{t('ctaNoneHint')}</span>
                  </button>
                </div>
              </fieldset>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t('format')}</legend>
                <div className="flex flex-col gap-2 sm:flex-row" role="radiogroup" aria-label={t('format')}>
                  {(['carousel', 'single', 'story'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      role="radio"
                      aria-checked={format === f}
                      className={option(format === f)}
                      onClick={() => setFormat(f)}
                    >
                      <span className="block font-medium">{t(`formats.${f}`)}</span>
                      <span className="block text-xs text-muted-foreground">{t(`formats.${f}Hint`)}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <section className="space-y-1">
                <h3 className="text-sm font-medium">{t('style')}</h3>
                <p className="text-sm">
                  {t('styleTheme', { style: td(`styles.${design.styleId}.name`) })}{' '}
                  <Link href="/app/brand/visual" className="text-primary hover:underline">
                    {t('styleChange')}
                  </Link>
                </p>
              </section>

              <div className="grid gap-4 sm:grid-cols-3">
                {format !== 'single' ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="flow-slides">{t('slides')}</Label>
                    <Input
                      id="flow-slides"
                      type="number"
                      min={slidesMin}
                      max={slidesMax}
                      value={slidesValue}
                      onChange={(e) => setSlides(Number(e.target.value) || slidesMin)}
                    />
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="flow-photos">{t('photos')}</Label>
                  <select
                    id="flow-photos"
                    value={photoSource ?? ''}
                    onChange={(e) => setPhotoSource((e.target.value || null) as PhotoSource | null)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">{t('photosBrand')}</option>
                    {PHOTO_SOURCES.map((p) => (
                      <option key={p} value={p}>
                        {td(`photoSource.${p}`)}
                      </option>
                    ))}
                  </select>
                </div>
                {fromGallery ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="flow-gallery">{t('galleryCategory')}</Label>
                    <select
                      id="flow-gallery"
                      value={galleryCategoryId ?? ''}
                      onChange={(e) => setGalleryCategoryId(e.target.value || null)}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">{t('galleryAll')}</option>
                      {galleryCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {t('galleryOption', { name: c.name, count: c.count })}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">{t('galleryHint')}</p>
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="flow-locale">{t('language')}</Label>
                  <select
                    id="flow-locale"
                    value={locale ?? ''}
                    onChange={(e) => setLocale(e.target.value || null)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">{t('languageBrand')}</option>
                    {CONTENT_LOCALES.map((l) => (
                      <option key={l} value={l}>
                        {tl(l)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('colorsHint')}{' '}
                <Link href="/app/brand" className="text-primary underline underline-offset-2">
                  {t('colorsLink')}
                </Link>
              </p>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <section className="space-y-3">
                <div>
                  <h2 className="text-sm font-medium">{t('networks')}</h2>
                  <p className="text-xs text-muted-foreground">{t('networksHint')}</p>
                </div>
                <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
                  <span>
                    <span className="block text-sm font-medium">{t('autoAccounts')}</span>
                    <span className="block text-xs text-muted-foreground">{t('autoAccountsHint')}</span>
                  </span>
                  <Switch
                    checked={autoAccounts}
                    onCheckedChange={(v) => setAutoAccounts(Boolean(v))}
                    aria-label={t('autoAccounts')}
                  />
                </label>
                {accounts.length ? (
                  <div className="flex flex-wrap gap-2">
                    {accounts.map((a) => {
                      const ok = supports(a)
                      const on = autoAccounts ? ok : accountIds.includes(a.id)
                      return (
                        <label
                          key={a.id}
                          className={cn(
                            'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm',
                            on && 'border-primary bg-primary/5',
                            !ok && 'opacity-60',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={on}
                            disabled={autoAccounts || !ok}
                            onChange={(e) =>
                              setAccountIds((cur) =>
                                e.target.checked ? [...cur, a.id] : cur.filter((x) => x !== a.id),
                              )
                            }
                          />
                          {PLATFORMS[a.platform].label} · {a.username ? `@${a.username}` : a.name}
                          {!ok ? (
                            <span className="text-xs text-muted-foreground">({t('unsupported')})</span>
                          ) : null}
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('noAccounts')}</p>
                )}
              </section>

              <section className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-medium">{t('daysLabel')}</h2>
                    <p className="text-xs text-muted-foreground">{t('daysHint')}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    <Check className="size-3.5" aria-hidden />
                    {t('alwaysReview')}
                  </span>
                </div>
                <div
                  className="grid grid-cols-4 gap-2 sm:grid-cols-7"
                  role="group"
                  aria-label={t('daysLabel')}
                >
                  {WEEK.map((d) => {
                    const on = days.includes(d)
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setDays((cur) => (on ? cur.filter((x) => x !== d) : [...cur, d].sort()))
                        }
                        className={cn(
                          'rounded-lg border py-2 text-sm',
                          on ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted/50',
                        )}
                      >
                        {tf(dayKey(d))}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">{t('perWeek', { n: days.length })}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="flow-time">{t('time')}</Label>
                    <Input
                      id="flow-time"
                      type="time"
                      value={timeLocal}
                      disabled={autoTime}
                      onChange={(e) => setTimeLocal(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">{t('timezone', { tz: timeZone })}</p>
                  </div>
                  <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
                    <span>
                      <span className="block text-sm font-medium">{t('autoTime')}</span>
                      <span className="block text-xs text-muted-foreground">{t('autoTimeHint')}</span>
                    </span>
                    <Switch
                      checked={autoTime}
                      onCheckedChange={(v) => setAutoTime(Boolean(v))}
                      aria-label={t('autoTime')}
                    />
                  </label>
                </div>
                <p className="rounded-md bg-muted px-3 py-2 text-sm">
                  {t('summary', {
                    days: [...days]
                      .sort((a, b) => WEEK.indexOf(a) - WEEK.indexOf(b))
                      .map((d) => tf(dayKey(d)))
                      .join(', '),
                    time: autoTime ? t('autoTimeShort') : timeLocal,
                  })}
                </p>
              </section>

              {hasInstagram && format !== 'story' ? (
                <section className="space-y-2">
                  <div>
                    <h2 className="text-sm font-medium">{t('collaborators')}</h2>
                    <p className="text-xs text-muted-foreground">{t('collaboratorsHint')}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {collaborators.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm"
                      >
                        @{c}
                        <button
                          type="button"
                          onClick={() => setCollaborators((cur) => cur.filter((x) => x !== c))}
                          aria-label={t('removeCollaborator', { name: c })}
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      </span>
                    ))}
                  </div>
                  {collaborators.length < 3 ? (
                    <div className="flex max-w-sm gap-2">
                      <Input
                        value={collabInput}
                        placeholder={t('collaboratorPlaceholder')}
                        maxLength={31}
                        onChange={(e) => setCollabInput(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!/^@?[A-Za-z0-9._]{1,30}$/.test(collabInput.trim())}
                        onClick={() => {
                          const v = collabInput.trim().replace(/^@/, '').toLowerCase()
                          if (v && !collaborators.includes(v)) setCollaborators((cur) => [...cur, v])
                          setCollabInput('')
                        }}
                      >
                        {t('addCollaborator')}
                      </Button>
                    </div>
                  ) : null}
                </section>
              ) : null}

              <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <span className="text-sm font-medium">{t('active')}</span>
                <Switch
                  checked={active}
                  onCheckedChange={(v) => setActive(Boolean(v))}
                  aria-label={t('active')}
                />
              </label>
            </>
          ) : null}

          <ErrorBox error={save.error} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <Button variant="ghost" nativeButton={false} render={<Link href="/app/flows" />}>
              {t('cancel')}
            </Button>
            <div className="flex gap-2">
              {step > 1 ? (
                <Button variant="outline" onClick={() => setStep(step - 1)}>
                  {t('back')}
                </Button>
              ) : null}
              {step < 3 ? (
                <Button disabled={step === 1 && !step1Ok} onClick={() => setStep(step + 1)}>
                  {t('next')}
                </Button>
              ) : (
                <Button
                  disabled={!canEdit || !step1Ok || !step3Ok || save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? t('saving') : t('save')}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
