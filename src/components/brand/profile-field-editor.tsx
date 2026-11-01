'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/**
 * Izmena jednog polja profila na mestu (Brain): tekst, lista (stavka po redu), parovi „naziv: opis”,
 * činjenice, mreže, izbor, da/ne i mesto. Sačuvana izmena je nova verzija profila, a polje se
 * zaključava da ga sledeća analiza sajta ne pregazi (brif 5.6).
 */
export type FieldEdit =
  | { kind: 'text'; value: string | null; multiline?: boolean; required?: boolean }
  | { kind: 'lines'; value: string[]; comma?: boolean }
  | {
      kind: 'pairs'
      value: Array<{ name: string; description: string | null }>
      requiredDescription?: boolean
    }
  | { kind: 'facts'; value: Array<{ claim: string; source_url: string | null }> }
  | { kind: 'social'; value: Record<string, string> }
  | { kind: 'choice'; value: string; options: Array<{ value: string; label: string }> }
  | { kind: 'bool'; value: boolean; label: string }
  | { kind: 'location'; value: { city: string | null; country: string | null } }

type Draft = string | boolean | { city: string; country: string }

function toDraft(edit: FieldEdit): Draft {
  switch (edit.kind) {
    case 'text':
      return edit.value ?? ''
    case 'lines':
      return edit.value.join(edit.comma ? ', ' : '\n')
    case 'pairs':
      return edit.value.map((p) => (p.description ? `${p.name}: ${p.description}` : p.name)).join('\n')
    case 'facts':
      return edit.value.map((f) => f.claim).join('\n')
    case 'social':
      return Object.entries(edit.value)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    case 'choice':
    case 'bool':
      return edit.value
    case 'location':
      return { city: edit.value.city ?? '', country: edit.value.country ?? '' }
  }
}

const lines = (text: string) =>
  text
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)

/** Mreža iz adrese bez oznake („https://www.instagram.com/x” → instagram). */
function networkOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').split('.')[0] || null
  } catch {
    return null
  }
}

/** Vrednost za API iz unetog teksta; opis posle prve dvotačke, mreža pre nje. */
export function fromDraft(edit: FieldEdit, draft: Draft): unknown {
  switch (edit.kind) {
    case 'text': {
      const value = String(draft).trim()
      return value || (edit.required ? value : null)
    }
    case 'lines':
      return String(draft)
        .split(edit.comma ? /[\n,]/ : '\n')
        .map((x) => x.trim())
        .filter(Boolean)
    case 'pairs':
      return lines(String(draft)).map((line) => {
        const i = line.indexOf(':')
        const name = (i > 0 ? line.slice(0, i) : line).trim()
        const description = i > 0 ? line.slice(i + 1).trim() : ''
        return { name, description: description || (edit.requiredDescription ? '' : null) }
      })
    case 'facts': {
      // izvor ostaje uz činjenicu koja nije menjana
      const sources = new Map(edit.value.map((f) => [f.claim, f.source_url]))
      return lines(String(draft)).map((claim) => ({ claim, source_url: sources.get(claim) ?? null }))
    }
    case 'social':
      return Object.fromEntries(
        lines(String(draft)).flatMap((line) => {
          const m = line.match(/^([^:\s][^:]*?):\s+(\S.*)$/)
          if (m) return [[m[1]!.trim().toLowerCase(), m[2]!.trim()]]
          const network = networkOf(line)
          return network ? [[network, line]] : []
        }),
      )
    case 'choice':
    case 'bool':
      return draft
    case 'location': {
      const place = draft as { city: string; country: string }
      return { city: place.city.trim() || null, country: place.country.trim() || null }
    }
  }
}

export function FieldEditor({
  id,
  label,
  edit,
  onSave,
  onCancel,
}: {
  id: string
  label: string
  edit: FieldEdit
  onSave: (value: unknown) => Promise<void>
  onCancel: () => void
}) {
  const t = useTranslations('brandBrain.field')
  const [draft, setDraft] = useState<Draft>(() => toDraft(edit))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const missing = edit.kind === 'text' && edit.required && !String(draft).trim()

  const submit = async () => {
    setPending(true)
    setError(null)
    try {
      await onSave(fromDraft(edit, draft))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    } finally {
      setPending(false)
    }
  }

  const text = typeof draft === 'string' ? draft : ''
  const rows = Math.min(12, Math.max(3, text.split('\n').length + 1))
  const hint =
    edit.kind === 'lines'
      ? edit.comma
        ? t('commaHint')
        : t('linesHint')
      : edit.kind === 'pairs'
        ? t('pairsHint')
        : edit.kind === 'facts'
          ? t('linesHint')
          : edit.kind === 'social'
            ? t('socialHint')
            : null

  return (
    <form
      className="space-y-2 pt-1"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      {edit.kind === 'text' && !edit.multiline ? (
        <Input id={id} aria-label={label} value={text} onChange={(e) => setDraft(e.target.value)} autoFocus />
      ) : edit.kind === 'choice' ? (
        <select
          id={id}
          aria-label={label}
          value={text}
          onChange={(e) => setDraft(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          {edit.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : edit.kind === 'bool' ? (
        <label htmlFor={id} className="flex items-center gap-2 text-sm">
          <input
            id={id}
            type="checkbox"
            checked={draft === true}
            onChange={(e) => setDraft(e.target.checked)}
            className="size-4"
          />
          {edit.label}
        </label>
      ) : edit.kind === 'location' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {(['city', 'country'] as const).map((part) => (
            <div key={part} className="space-y-1">
              <Label htmlFor={`${id}-${part}`} className="text-xs">
                {t(part)}
              </Label>
              <Input
                id={`${id}-${part}`}
                value={(draft as { city: string; country: string })[part]}
                onChange={(e) =>
                  setDraft({ ...(draft as { city: string; country: string }), [part]: e.target.value })
                }
              />
            </div>
          ))}
        </div>
      ) : (
        <Textarea
          id={id}
          aria-label={label}
          rows={rows}
          value={text}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
        />
      )}
      <p className="text-xs text-muted-foreground">
        {hint ? `${hint} ` : ''}
        {t('lockNote')}
      </p>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending || missing}>
          {pending ? t('saving') : t('save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  )
}
