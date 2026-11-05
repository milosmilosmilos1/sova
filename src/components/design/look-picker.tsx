'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Globe, LoaderCircle, Play, RefreshCw, Trash2, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { STYLE_IDS, type StyleId } from '@/lib/visuals/design/catalog'
import { customColors, type LookId, type LookOption } from '@/lib/visuals/design/looks'
import type { DesignColors } from '@/lib/visuals/design/types'
import { cn } from '@/lib/utils'

import { previewUrl } from './style-picker'

/** Odgovor `GET /api/brands/{id}/design/looks` (D-123). */
export interface LooksView {
  website: string | null
  site: { url: string; at: string; source: 'site' | 'profile'; options: LookOption[] } | null
  siteError: string | null
  visit: boolean
  custom: { styleId: StyleId; primary: string; secondary: string; tertiary: string; font: string }
  current: LookId | null
  fonts: string[]
  customFonts: Array<{ family: string; name: string }>
}

/** Izabrani izgled kako ide u `PATCH /api/brands/{id}/design`. */
export interface LookChoice {
  look: LookId
  styleId: StyleId
  colors: DesignColors
  fonts: { headings: string; body: string }
}

const HEX = /^#[0-9a-fA-F]{6}$/

/** Vrednost koja kasni dok se menja (birač boje šalje desetine promena u sekundi). */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}

/** Klasična objava, slajd karusela, priča i video (D-128): isti izgled u četiri vrste sadržaja. */
const KINDS = [
  { key: 'post', kind: 'cover', format: 'portrait' },
  { key: 'carousel', kind: 'point', format: 'portrait' },
  { key: 'story', kind: 'cta', format: 'story' },
] as const

function Previews({
  brandId,
  option,
  label,
}: {
  brandId: string
  option: Omit<LookOption, 'id'>
  label: string
}) {
  const t = useTranslations('design.looks')
  const layer = (layer: 'overlay' | 'backdrop') =>
    previewUrl({
      brandId,
      styleId: option.styleId,
      format: 'story',
      colors: option.colors,
      font: option.fonts.headings,
      layer,
    })
  return (
    <div className="grid grid-cols-[0.8fr_0.8fr_0.5625fr_0.5625fr] items-end gap-2">
      {KINDS.map((k) => (
        <figure key={k.key} className="space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- dinamički pregled sa API-ja */}
          <img
            src={previewUrl({
              brandId,
              styleId: option.styleId,
              format: k.format,
              kind: k.kind,
              colors: option.colors,
              font: option.fonts.headings,
            })}
            alt={`${label}: ${t(`kinds.${k.key}`)}`}
            loading="lazy"
            className={cn(
              'w-full rounded-md border bg-muted object-cover',
              k.format === 'story' ? 'aspect-[9/16]' : 'aspect-[4/5]',
            )}
          />
          <figcaption className="text-center text-xs text-muted-foreground">{t(`kinds.${k.key}`)}</figcaption>
        </figure>
      ))}
      <figure className="space-y-1">
        <div className="relative aspect-[9/16] overflow-hidden rounded-md border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- dinamički pregled sa API-ja */}
          <img
            src={layer('backdrop')}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover motion-safe:animate-video-zoom"
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- dinamički pregled sa API-ja */}
          <img
            src={layer('overlay')}
            alt={`${label}: ${t('kinds.video')}`}
            loading="lazy"
            className="absolute inset-0 size-full motion-safe:animate-video-text"
          />
          <Play
            className="absolute top-1 left-1 size-4 rounded-full bg-black/55 p-0.5 text-white"
            aria-hidden
          />
        </div>
        <figcaption className="text-center text-xs text-muted-foreground">{t('kinds.video')}</figcaption>
      </figure>
    </div>
  )
}

function Swatches({ colors, font }: { colors: DesignColors; font: string }) {
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="flex -space-x-1" aria-hidden>
        {[colors.primary, colors.secondary, colors.background].map((c, i) => (
          <span key={i} className="size-4 rounded-full border border-black/10" style={{ background: c }} />
        ))}
      </span>
      <span>{font}</span>
    </span>
  )
}

function ColorField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-24 shrink-0 text-sm sm:w-36">
        {label}
      </label>
      <input
        type="color"
        aria-label={label}
        value={HEX.test(value) ? value : '#000000'}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1 disabled:cursor-not-allowed"
      />
      <Input
        id={id}
        value={value}
        disabled={disabled}
        maxLength={7}
        spellCheck={false}
        aria-invalid={!HEX.test(value)}
        onChange={(e) => {
          const v = e.target.value.trim().toUpperCase()
          onChange(v.startsWith('#') ? v : `#${v}`)
        }}
        className="w-24 font-mono uppercase sm:w-28"
      />
    </div>
  )
}

const cardClass = (active: boolean) =>
  cn(
    'min-w-0 space-y-3 rounded-xl border p-3 transition-colors',
    active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card',
  )

/** Tema sa sajta: naziv, boje i font, pa objava, karusel i priča u toj temi. */
function OptionCard({
  brandId,
  option,
  selected,
  disabled,
  onSelect,
}: {
  brandId: string
  option: LookOption
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  const t = useTranslations('design.looks')
  const name = t(`options.${option.id}.name`)
  return (
    <div className={cardClass(selected)}>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        disabled={disabled}
        onClick={onSelect}
        className="block w-full space-y-3 text-left disabled:cursor-not-allowed"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="space-y-0.5">
            <span className="block font-medium">{name}</span>
            <span className="block text-xs text-muted-foreground">{t(`options.${option.id}.hint`)}</span>
          </span>
          {selected ? <Check className="size-5 shrink-0 text-primary" aria-hidden /> : null}
        </span>
        <Swatches colors={option.colors} font={option.fonts.headings} />
        <Previews brandId={brandId} option={option} label={name} />
      </button>
    </div>
  )
}

/**
 * Izbor izgleda (D-123): tri svetle i tri tamne teme od boja i fontova sa sajta brenda i sedma po
 * izboru korisnika (primarna, sekundarna i tercijalna boja i font). Svaka tema se vidi kao klasična
 * objava, slajd karusela i priča. Sajt koji Sova još nije posetila poseti se pri prvom otvaranju.
 */
export function LookPicker({
  brandId,
  canEdit,
  onChoice,
}: {
  brandId: string
  canEdit: boolean
  onChoice: (choice: LookChoice | null) => void
}) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['looks', brandId],
    queryFn: () => api<LooksView>(`/api/brands/${brandId}/design/looks`),
  })
  // prva poseta sajtu ide sama, jednom po otvaranju; rezultat zamenjuje predloge iz analize
  const autoVisit = useQuery({
    queryKey: ['looks-visit', brandId],
    queryFn: async () => {
      const view = await api<LooksView>(`/api/brands/${brandId}/design/looks`, { method: 'POST' })
      qc.setQueryData(['looks', brandId], view)
      return view
    },
    enabled: canEdit && Boolean(query.data?.visit),
    staleTime: Infinity,
    retry: false,
  })
  const revisit = useMutation({
    mutationFn: () => api<LooksView>(`/api/brands/${brandId}/design/looks`, { method: 'POST' }),
    onSuccess: (view) => qc.setQueryData(['looks', brandId], view),
  })

  if (!query.data)
    return query.error ? (
      <ErrorBox error={query.error} />
    ) : (
      <div className="h-96 animate-pulse rounded-lg bg-muted" />
    )
  return (
    <LookOptions
      // novi predlozi sa sajta (ponovna poseta) daju nov obrazac sa njihovim bojama
      key={`${brandId}:${query.data.site?.at ?? 'none'}`}
      brandId={brandId}
      canEdit={canEdit}
      view={query.data}
      visiting={autoVisit.isFetching || revisit.isPending}
      visitError={autoVisit.error ?? revisit.error}
      onRevisit={() => revisit.mutate()}
      onChoice={onChoice}
    />
  )
}

function LookOptions({
  brandId,
  canEdit,
  view,
  visiting,
  visitError,
  onRevisit,
  onChoice,
}: {
  brandId: string
  canEdit: boolean
  view: LooksView
  visiting: boolean
  visitError: unknown
  onRevisit: () => void
  onChoice: (choice: LookChoice | null) => void
}) {
  const t = useTranslations('design.looks')
  const td = useTranslations('design')
  const options = view.site?.options ?? []
  const [selected, setSelected] = useState<LookId | null>(view.current)
  const [custom, setCustom] = useState({
    // sopstvena tema u bilo kom od 28 stilova (D-160)
    styleId: view.custom.styleId,
    primary: view.custom.primary,
    secondary: view.custom.secondary,
    tertiary: view.custom.tertiary,
    font: view.fonts.includes(view.custom.font) ? view.custom.font : (view.fonts[0] ?? 'Inter'),
  })
  // pregled sopstvenog izgleda ne traži novu sliku za svaki pomeraj birača boje
  // Google font upisan po imenu ili tek otpremljen sopstveni font (D-159), dok pogled ne stigne ponovo
  const [extraFonts, setExtraFonts] = useState<string[]>([])
  const ownName = (family: string) => view.customFonts.find((f) => f.family === family)?.name ?? null
  const deferred = useSettled(custom, 450)
  const valid = [deferred.primary, deferred.secondary, deferred.tertiary].every((c) => HEX.test(c))
  const customOption: Omit<LookOption, 'id'> = {
    styleId: deferred.styleId,
    colors: customColors(deferred.primary, deferred.secondary, deferred.tertiary),
    fonts: { headings: deferred.font, body: deferred.font },
  }
  const disabled = !canEdit

  const choose = (id: LookId, next = custom) => {
    setSelected(id)
    if (id === 'custom') {
      const ok = [next.primary, next.secondary, next.tertiary].every((c) => HEX.test(c))
      onChoice(
        ok
          ? {
              look: 'custom',
              styleId: next.styleId,
              colors: customColors(next.primary, next.secondary, next.tertiary),
              fonts: { headings: next.font, body: next.font },
            }
          : null,
      )
      return
    }
    const option = options.find((o) => o.id === id)
    if (option) onChoice({ look: id, styleId: option.styleId, colors: option.colors, fonts: option.fonts })
  }
  const edit = (patch: Partial<typeof custom>) => {
    const next = { ...custom, ...patch }
    setCustom(next)
    choose('custom', next)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="flex items-center gap-2 text-muted-foreground">
          {visiting ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              <span role="status">{t('visiting')}</span>
            </>
          ) : view.site ? (
            <>
              <Globe className="size-4" aria-hidden />
              {view.site.source === 'site'
                ? t('fromSite', { site: view.site.url.replace(/^https?:\/\//, '').replace(/\/$/, '') })
                : t('fromProfile')}
            </>
          ) : (
            t('noSite')
          )}
        </p>
        {canEdit && view.website ? (
          <Button type="button" size="sm" variant="ghost" disabled={visiting} onClick={onRevisit}>
            <RefreshCw className="size-4" aria-hidden />
            {t('revisit')}
          </Button>
        ) : null}
      </div>
      {view.siteError ? (
        <p role="status" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          {view.siteError}
        </p>
      ) : null}
      <ErrorBox error={visitError} />

      <div role="radiogroup" aria-label={t('title')} className="space-y-6">
        {(
          [
            ['lightGroup', options.filter((o) => o.id.startsWith('light-'))],
            ['darkGroup', options.filter((o) => o.id.startsWith('dark-'))],
          ] as const
        ).map(([group, list]) =>
          list.length ? (
            <section key={group} className="space-y-3">
              <h3 className="text-sm font-medium">{t(group)}</h3>
              <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                {list.map((o) => (
                  <OptionCard
                    key={o.id}
                    brandId={brandId}
                    option={o}
                    selected={selected === o.id}
                    disabled={disabled}
                    onSelect={() => choose(o.id)}
                  />
                ))}
              </div>
            </section>
          ) : null,
        )}

        <section className="space-y-3">
          <h3 className="text-sm font-medium">{t('customGroup')}</h3>
          <div
            className={cn(
              cardClass(selected === 'custom'),
              'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]',
            )}
          >
            <div className="space-y-3">
              <button
                type="button"
                role="radio"
                aria-checked={selected === 'custom'}
                disabled={disabled}
                onClick={() => choose('custom')}
                className="flex w-full items-start justify-between gap-2 text-left disabled:cursor-not-allowed"
              >
                <span className="space-y-0.5">
                  <span className="block font-medium">{t('options.custom.name')}</span>
                  <span className="block text-xs text-muted-foreground">{t('options.custom.hint')}</span>
                </span>
                {selected === 'custom' ? (
                  <Check className="size-5 shrink-0 text-primary" aria-hidden />
                ) : null}
              </button>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label htmlFor={`look-style-${brandId}`} className="w-24 shrink-0 text-sm sm:w-36">
                    {t('style')}
                  </label>
                  <select
                    id={`look-style-${brandId}`}
                    value={custom.styleId}
                    disabled={disabled}
                    onChange={(e) => edit({ styleId: e.target.value as StyleId })}
                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {STYLE_IDS.map((id) => (
                      <option key={id} value={id}>
                        {td(`styles.${id}.name`)}
                      </option>
                    ))}
                  </select>
                </div>
                <ColorField
                  id={`look-primary-${brandId}`}
                  label={t('primary')}
                  value={custom.primary}
                  onChange={(v) => edit({ primary: v })}
                  disabled={disabled}
                />
                <ColorField
                  id={`look-secondary-${brandId}`}
                  label={t('secondary')}
                  value={custom.secondary}
                  onChange={(v) => edit({ secondary: v })}
                  disabled={disabled}
                />
                <ColorField
                  id={`look-tertiary-${brandId}`}
                  label={t('tertiary')}
                  value={custom.tertiary}
                  onChange={(v) => edit({ tertiary: v })}
                  disabled={disabled}
                />
                <div className="flex items-center gap-2">
                  <label htmlFor={`look-font-${brandId}`} className="w-24 shrink-0 text-sm sm:w-36">
                    {t('font')}
                  </label>
                  <select
                    id={`look-font-${brandId}`}
                    value={custom.font}
                    disabled={disabled}
                    onChange={(e) => edit({ font: e.target.value })}
                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {[...new Set([...view.fonts, ...extraFonts, custom.font])].map((f) => (
                      <option key={f} value={f}>
                        {ownName(f)
                          ? t('fontOwn', { font: ownName(f)! })
                          : view.site && (f === options[0]?.fonts.headings || f === options[0]?.fonts.body)
                            ? t('fontFromSite', { font: f })
                            : f}
                      </option>
                    ))}
                  </select>
                </div>
                <FontSources
                  brandId={brandId}
                  disabled={disabled}
                  selectedOwn={Boolean(ownName(custom.font))}
                  selected={custom.font}
                  onFont={(font) => {
                    setExtraFonts((list) => (list.includes(font) ? list : [...list, font]))
                    edit({ font })
                  }}
                  onRemoved={() => edit({ font: view.fonts.find((f) => !ownName(f)) ?? 'Inter' })}
                />
                <p className="text-xs text-muted-foreground">{t('tertiaryHint')}</p>
              </div>
            </div>
            {valid ? (
              <Previews brandId={brandId} option={customOption} label={t('options.custom.name')} />
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}

/** Fajl u base64 bez prefiksa `data:` (fontovi su mali, do 2 MB). */
function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Font van spiska (D-159): bilo koji Google font po imenu (Sova proveri da postoji) ili sopstveni font
 * brenda (TTF, OTF ili WOFF), koji važi u svim stilovima.
 */
function FontSources({
  brandId,
  disabled,
  selected,
  selectedOwn,
  onFont,
  onRemoved,
}: {
  brandId: string
  disabled: boolean
  selected: string
  selectedOwn: boolean
  onFont: (family: string) => void
  onRemoved: () => void
}) {
  const t = useTranslations('design.looks')
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [missing, setMissing] = useState<string | null>(null)
  const google = useMutation({
    mutationFn: (family: string) =>
      api<{ family: string; found: boolean }>(`/api/fonts/google?family=${encodeURIComponent(family)}`),
    onSuccess: (r) => {
      if (!r.found) return setMissing(r.family)
      setMissing(null)
      setName('')
      onFont(r.family)
    },
  })
  const upload = useMutation({
    mutationFn: async (file: File) =>
      api<{ family: string; name: string }>(`/api/brands/${brandId}/design/fonts`, {
        method: 'POST',
        json: {
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Font',
          data: await fileBase64(file),
        },
      }),
    onSuccess: async (font) => {
      await qc.invalidateQueries({ queryKey: ['looks', brandId] })
      onFont(font.family)
    },
  })
  const remove = useMutation({
    mutationFn: () =>
      api(`/api/brands/${brandId}/design/fonts?family=${encodeURIComponent(selected)}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['looks', brandId] })
      onRemoved()
    },
  })
  const trimmed = name.trim()
  return (
    <div className="space-y-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (trimmed) google.mutate(trimmed)
        }}
      >
        <label htmlFor={`look-google-font-${brandId}`} className="w-24 shrink-0 text-sm sm:w-36">
          {t('fontGoogle')}
        </label>
        <Input
          id={`look-google-font-${brandId}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('fontGooglePlaceholder')}
          maxLength={40}
          disabled={disabled || google.isPending}
          className="h-9 min-w-0 flex-1"
        />
        <Button type="submit" size="sm" variant="outline" disabled={disabled || !trimmed || google.isPending}>
          {google.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          {t('fontGoogleAdd')}
        </Button>
      </form>
      {missing ? (
        <p role="alert" className="text-xs text-destructive">
          {t('fontGoogleMissing', { font: missing })}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || upload.isPending}
          nativeButton={false}
          render={<label />}
        >
          {upload.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
          {t('fontUpload')}
          <input
            type="file"
            accept=".ttf,.otf,.woff,font/ttf,font/otf,font/woff"
            className="sr-only"
            disabled={disabled || upload.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) upload.mutate(file)
            }}
          />
        </Button>
        {selectedOwn ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled || remove.isPending}
            onClick={() => remove.mutate()}
          >
            <Trash2 aria-hidden />
            {t('fontRemove')}
          </Button>
        ) : null}
        <span className="text-xs text-muted-foreground">{t('fontUploadHint')}</span>
      </div>
      <ErrorBox error={google.error ?? upload.error ?? remove.error} />
    </div>
  )
}
