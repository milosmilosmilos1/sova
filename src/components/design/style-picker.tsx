'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { PHOTO_STYLE_IDS, STYLE_IDS, type PostSize, type StyleId } from '@/lib/visuals/design/catalog'
import type { DesignColors } from '@/lib/visuals/design/types'
import { cn } from '@/lib/utils'

export type PreviewFormat = 'carousel' | 'post' | 'story'

/** Adresa pregleda stila (GET /api/visuals/preview); boje idu u parametar dok ih korisnik menja. */
export function previewUrl(input: {
  brandId: string
  styleId: StyleId
  format: 'portrait' | 'square' | 'story'
  kind?: 'cover' | 'point' | 'cta'
  colors?: DesignColors | null
  photo?: boolean
  /** menja adresu kad se promeni nešto što server čita sam (npr. logo), da pregledač ne vrati staru sliku */
  v?: string | null
}): string {
  const q = new URLSearchParams({
    brandId: input.brandId,
    styleId: input.styleId,
    format: input.format,
    kind: input.kind ?? 'cover',
    photo: input.photo === false ? '0' : '1',
  })
  if (input.v) q.set('v', input.v)
  if (input.colors)
    q.set(
      'c',
      [
        input.colors.primary,
        input.colors.secondary,
        input.colors.background,
        input.colors.text,
        input.colors.muted,
      ]
        .map((c) => c.replace('#', ''))
        .join('-'),
    )
  return `/api/visuals/preview?${q.toString()}`
}

export function renderFormat(format: PreviewFormat, size: PostSize): 'portrait' | 'square' | 'story' {
  return format === 'story' ? 'story' : size
}

/**
 * Birač stila objave (D-108): 22 stila sa pregledom u bojama brenda. Pregled se učitava kad kartica
 * uđe u ekran; isti birač koriste podešavanja brenda, „Nova objava” i tokovi.
 */
export function StylePicker({
  brandId,
  value,
  onChange,
  size,
  colors,
  photo = true,
  disabled = false,
  initialFormat = 'carousel',
  showFormatTabs = true,
}: {
  brandId: string
  value: StyleId
  onChange: (id: StyleId) => void
  size: PostSize
  colors?: DesignColors | null
  photo?: boolean
  disabled?: boolean
  initialFormat?: PreviewFormat
  showFormatTabs?: boolean
}) {
  const t = useTranslations('design')
  const [format, setFormat] = useState<PreviewFormat>(initialFormat)
  const [group, setGroup] = useState<'all' | 'type' | 'photo'>('all')
  const ids = STYLE_IDS.filter((id) =>
    group === 'all' ? true : group === 'photo' ? PHOTO_STYLE_IDS.has(id) : !PHOTO_STYLE_IDS.has(id),
  )
  const aspect = format === 'story' ? 'aspect-[9/16]' : size === 'square' ? 'aspect-square' : 'aspect-[4/5]'
  const pill = (active: boolean) =>
    cn(
      'rounded-md px-3 py-1.5 text-sm transition-colors',
      active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
    )
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {showFormatTabs ? (
          <div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label={t('format.label')}>
            {(['carousel', 'post', 'story'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={pill(format === f)}
                aria-pressed={format === f}
                onClick={() => setFormat(f)}
              >
                {t(`format.${f}`)}
              </button>
            ))}
          </div>
        ) : null}
        <div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label={t('choose')}>
          {(['all', 'type', 'photo'] as const).map((g) => (
            <button
              key={g}
              type="button"
              className={pill(group === g)}
              aria-pressed={group === g}
              onClick={() => setGroup(g)}
            >
              {t(`groups.${g}`)}
            </button>
          ))}
        </div>
      </div>
      <div
        role="radiogroup"
        aria-label={t('choose')}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
      >
        {ids.map((id) => {
          const selected = id === value
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(id)}
              className={cn(
                'group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60',
                selected ? 'border-primary ring-2 ring-primary' : 'hover:shadow-md',
              )}
            >
              <span className={cn('relative block w-full overflow-hidden bg-muted', aspect)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- pregled je dinamička slika sa API-ja */}
                <img
                  src={previewUrl({
                    brandId,
                    styleId: id,
                    format: renderFormat(format, size),
                    // karakter „Statistike” i „Liste” se vidi tek na slajdu sadržaja
                    kind: id === 'stat' || id === 'list' ? 'point' : 'cover',
                    colors,
                    photo,
                  })}
                  alt={t(`styles.${id}.name`)}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                {selected ? (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    <Check className="size-3" aria-hidden />
                    {t('selected')}
                  </span>
                ) : null}
              </span>
              <span className="space-y-0.5 p-3">
                <span className="block text-sm font-medium">{t(`styles.${id}.name`)}</span>
                <span className="line-clamp-2 block text-xs text-muted-foreground">
                  {t(`styles.${id}.desc`)}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
