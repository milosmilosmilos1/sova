'use client'

import { useMutation } from '@tanstack/react-query'
import { Plus, Sparkles, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  mergeVoice,
  VOICE_LIMITS,
  VOICE_TOPICS_MAX,
  type BrandVoice,
  type VoiceTextField,
} from '@/lib/schemas/voice'

export interface VoiceViewData {
  voice: BrandVoice
  saved: boolean
  updatedAt: string | null
  fromProfile: boolean
  sources: { profile: boolean; documents: number; posts: number }
  draftPrice: number
}

const FIELDS: Array<{ key: VoiceTextField; rows: number }> = [
  { key: 'offer', rows: 3 },
  { key: 'audience', rows: 2 },
  { key: 'tone', rows: 0 },
  { key: 'usp', rows: 2 },
  { key: 'avoid', rows: 2 },
  { key: 'cta', rows: 0 },
]

/**
 * Glas brenda (D-112): šest polja svojim rečima i glavne teme. „Predloži” popunjava samo prazna
 * polja i dodaje teme iz analize sajta, dokumenata i ranijih objava.
 */
export function VoiceForm({
  brandId,
  value,
  onChange,
  disabled,
  view,
  emailVerified,
}: {
  brandId: string
  value: BrandVoice
  onChange: (next: BrandVoice) => void
  disabled: boolean
  view: VoiceViewData
  emailVerified: boolean
}) {
  const t = useTranslations('voice')
  const [topic, setTopic] = useState('')
  const [drafted, setDrafted] = useState(false)
  const hasSource = view.sources.profile || view.sources.documents > 0 || view.sources.posts > 0
  const full = value.topics.length >= VOICE_TOPICS_MAX

  const draft = useMutation({
    mutationFn: () =>
      api<{ draft: BrandVoice }>(`/api/brands/${brandId}/voice/draft`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
      }),
    onSuccess: (r) => {
      onChange(mergeVoice(value, r.draft))
      setDrafted(true)
    },
  })

  const set = (key: VoiceTextField, text: string) => onChange({ ...value, [key]: text })
  const addTopic = () => {
    const next = topic.trim()
    if (next.length < 3 || full) return
    if (!value.topics.some((x) => x.toLocaleLowerCase() === next.toLocaleLowerCase()))
      onChange({ ...value, topics: [...value.topics, next.slice(0, 160)] })
    setTopic('')
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || !hasSource || !emailVerified || draft.isPending}
            onClick={() => draft.mutate()}
          >
            <Sparkles className="size-4" aria-hidden />
            {draft.isPending ? t('draft.running') : t('draft.button', { price: view.draftPrice })}
          </Button>
          {drafted && !draft.isPending ? (
            <span role="status" className="text-sm text-muted-foreground">
              {t('draft.done')}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{hasSource ? t('draft.hint') : t('draft.noSources')}</p>
        <ErrorBox error={draft.error} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {FIELDS.map(({ key, rows }) => {
          const id = `voice-${key}`
          const max = VOICE_LIMITS[key]
          return (
            <div key={key} className={rows >= 3 ? 'space-y-1.5 md:col-span-2' : 'space-y-1.5'}>
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor={id}>{t(`fields.${key}`)}</Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {t('count', { count: value[key].length, max })}
                </span>
              </div>
              {rows ? (
                <Textarea
                  id={id}
                  rows={rows}
                  value={value[key]}
                  maxLength={max}
                  disabled={disabled}
                  placeholder={t(`fields.${key}Placeholder`)}
                  onChange={(e) => set(key, e.target.value)}
                />
              ) : (
                <Input
                  id={id}
                  value={value[key]}
                  maxLength={max}
                  disabled={disabled}
                  placeholder={t(`fields.${key}Placeholder`)}
                  onChange={(e) => set(key, e.target.value)}
                />
              )}
            </div>
          )
        })}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('topics.label')}</legend>
        <p className="text-xs text-muted-foreground">{t('topics.hint', { max: VOICE_TOPICS_MAX })}</p>
        {value.topics.length ? (
          <ul className="flex flex-wrap gap-2">
            {value.topics.map((x) => (
              <li
                key={x}
                className="flex max-w-full items-center gap-1 rounded-full border bg-card py-1 pr-1 pl-3 text-sm"
              >
                <span className="truncate">{x}</span>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={t('topics.remove', { topic: x })}
                  onClick={() => onChange({ ...value, topics: value.topics.filter((y) => y !== x) })}
                  className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-2">
          <Input
            aria-label={t('topics.label')}
            value={topic}
            maxLength={160}
            disabled={disabled || full}
            placeholder={full ? t('topics.full', { max: VOICE_TOPICS_MAX }) : t('topics.placeholder')}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTopic()
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || full || topic.trim().length < 3}
            onClick={addTopic}
          >
            <Plus className="size-4" aria-hidden />
            {t('topics.add')}
          </Button>
        </div>
      </fieldset>
    </div>
  )
}
