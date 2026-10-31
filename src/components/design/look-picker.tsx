'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Globe, LoaderCircle, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { StyleId } from '@/lib/visuals/design/catalog'
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

/** Klasična objava, slajd karusela i priča: isti izgled u tri vrste sadržaja. */
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
  return (
    <div className="grid grid-cols-[0.8fr_0.8fr_0.5625fr] items-end gap-2">
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
  const options = view.site?.options ?? []
  const [selected, setSelected] = useState<LookId | null>(view.current)
  const [custom, setCustom] = useState({
    primary: view.custom.primary,
    secondary: view.custom.secondary,
    tertiary: view.custom.tertiary,
    font: view.fonts.includes(view.custom.font) ? view.custom.font : (view.fonts[0] ?? 'Inter'),
  })
  // pregled sopstvenog izgleda ne traži novu sliku za svaki pomeraj birača boje
  const deferred = useSettled(custom, 450)
  const valid = [deferred.primary, deferred.secondary, deferred.tertiary].every((c) => HEX.test(c))
  const customOption: Omit<LookOption, 'id'> = {
    styleId: view.custom.styleId,
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
              styleId: view.custom.styleId,
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
                    {view.fonts.map((f) => (
                      <option key={f} value={f}>
                        {view.site && (f === options[0]?.fonts.headings || f === options[0]?.fonts.body)
                          ? t('fontFromSite', { font: f })
                          : f}
                      </option>
                    ))}
                  </select>
                </div>
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
