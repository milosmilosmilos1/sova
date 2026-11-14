'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { api } from '@/components/shared/api-client'
import { Label } from '@/components/ui/label'
import { CONTENT_KINDS, DATA_KINDS, type ContentKind } from '@/lib/schemas/brand-content'

export interface ComposeKindValue {
  kind: ContentKind
  ref: string | null
}

interface ContentItems {
  testimonials: Array<{ id: string; author: string; text: string }>
  team: Array<{ id: string; name: string; role: string }>
  pairs: Array<{ id: string; title: string }>
}

type DataKindKey = 'review' | 'team' | 'before_after'

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/**
 * Sadržaj brenda u Novoj objavi (D-165): vrsta (utisak, osoba, pre i posle, pitanje, humor) i stavka
 * iz Sadržaja brenda. Uz izbor stavke ide predlog teme, koji forma upiše samo kad je tema prazna.
 */
export function ComposeKind({
  brandId,
  value,
  onChange,
  selectClass,
}: {
  brandId: string
  value: ComposeKindValue | null
  onChange: (value: ComposeKindValue | null, topic: string | null) => void
  selectClass: string
}) {
  const t = useTranslations('studioTools.compose')
  const tk = useTranslations('brandContent.kinds')
  const content = useQuery({
    queryKey: ['brand-content', brandId],
    queryFn: () => api<ContentItems>(`/api/brands/${brandId}/content`),
  })
  const items = (kind: ContentKind): Array<{ id: string; label: string; topic: string }> => {
    const d = content.data
    if (!d) return []
    if (kind === 'review')
      return d.testimonials.map((x) => ({
        id: x.id,
        label: `${x.author}: ${cut(x.text, 50)}`,
        topic: t('kindTopic.review', { author: x.author }),
      }))
    if (kind === 'team')
      return d.team.map((x) => ({
        id: x.id,
        label: `${x.name}, ${x.role}`,
        topic: t('kindTopic.team', { name: x.name, role: x.role }),
      }))
    if (kind === 'before_after')
      return d.pairs.map((x) => ({
        id: x.id,
        label: x.title,
        topic: t('kindTopic.before_after', { title: x.title }),
      }))
    return []
  }
  const pick = (kind: ContentKind | '') => {
    if (!kind) return onChange(null, null)
    if (!DATA_KINDS.has(kind)) return onChange({ kind, ref: null }, null)
    const first = items(kind)[0]
    onChange({ kind, ref: first?.id ?? null }, first?.topic ?? null)
  }
  const dataKind = value && DATA_KINDS.has(value.kind) ? (value.kind as DataKindKey) : null
  const list = dataKind ? items(dataKind) : []
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="compose-kind">{t('kind')}</Label>
          <select
            id="compose-kind"
            value={value?.kind ?? ''}
            onChange={(e) => pick(e.target.value as ContentKind | '')}
            className={selectClass}
          >
            <option value="">{t('kindNone')}</option>
            {CONTENT_KINDS.map((k) => {
              const empty = DATA_KINDS.has(k) && !items(k).length
              return (
                <option key={k} value={k} disabled={empty}>
                  {tk(`${k}.one`)}
                  {empty ? ` (${t('kindEmpty')})` : ''}
                </option>
              )
            })}
          </select>
        </div>
        {dataKind ? (
          <div className="space-y-1.5">
            <Label htmlFor="compose-kind-item">{t(`kindItem.${dataKind}`)}</Label>
            <select
              id="compose-kind-item"
              value={value?.ref ?? ''}
              onChange={(e) => {
                const item = list.find((i) => i.id === e.target.value)
                onChange({ kind: dataKind, ref: e.target.value }, item?.topic ?? null)
              }}
              className={selectClass}
            >
              {list.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {value ? t(`kindHint.${value.kind}`) : t('kindIntro')}{' '}
        <Link href="/app/brand/content" className="text-primary hover:underline">
          {t('kindManage')}
        </Link>
      </p>
    </div>
  )
}
