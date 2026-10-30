'use client'

import { useTranslations } from 'next-intl'

import { Input } from '@/components/ui/input'
import { contrast } from '@/lib/visuals/design/kit'
import type { DesignColors } from '@/lib/visuals/design/types'

const KEYS = ['primary', 'secondary', 'background', 'text', 'muted'] as const
const HEX = /^#[0-9a-fA-F]{6}$/

/** Pet boja dizajna (D-108): birač boje i heks polje; upozorenje kad tekst nije čitljiv na pozadini. */
export function ColorsEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: DesignColors
  onChange: (next: DesignColors) => void
  disabled?: boolean
}) {
  const t = useTranslations('design.colors')
  const weak =
    HEX.test(value.background) && HEX.test(value.text) && contrast(value.background, value.text) < 4.5
  return (
    <div className="space-y-2">
      {KEYS.map((key) => (
        <div key={key} className="flex items-center gap-3">
          <label htmlFor={`color-${key}`} className="w-32 shrink-0 text-sm">
            {t(key)}
          </label>
          <input
            type="color"
            aria-label={t(key)}
            value={HEX.test(value[key]) ? value[key] : '#000000'}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, [key]: e.target.value.toUpperCase() })}
            className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1 disabled:cursor-not-allowed"
          />
          <Input
            id={`color-${key}`}
            value={value[key]}
            disabled={disabled}
            maxLength={7}
            spellCheck={false}
            aria-invalid={!HEX.test(value[key])}
            onChange={(e) => {
              const v = e.target.value.trim()
              onChange({ ...value, [key]: v.startsWith('#') ? v.toUpperCase() : `#${v.toUpperCase()}` })
            }}
            className="w-28 font-mono uppercase"
          />
        </div>
      ))}
      {weak ? (
        <p role="status" className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs">
          {t('contrast')}
        </p>
      ) : null}
    </div>
  )
}
