'use client'

import { useRef } from 'react'

import { BrandMark } from '@/components/brand/brand-mark'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { BrandSwatch } from '@/lib/brands/swatch'

export interface ShellOption {
  value: string
  label: string
  /** boja brenda (D-137): znak sa početnim slovom pored naziva */
  swatch?: BrandSwatch
}

/**
 * Birač radnog prostora i brenda u bočnoj traci. Brend nosi znak u svojoj boji (D-137), da se brendovi
 * razlikuju na prvi pogled. Izbor odmah šalje formu (server action), kao `AutoSubmitSelect`.
 */
export function ShellSelect({
  name,
  value,
  ariaLabel,
  options,
}: {
  name: string
  value: string
  ariaLabel: string
  options: ShellOption[]
}) {
  const input = useRef<HTMLInputElement>(null)
  const byValue = new Map(options.map((o) => [o.value, o]))
  return (
    <>
      <input ref={input} type="hidden" name={name} defaultValue={value} />
      <Select
        defaultValue={value}
        items={options.map((o) => ({ value: o.value, label: o.label }))}
        onValueChange={(next) => {
          const el = input.current
          if (!el || typeof next !== 'string' || next === el.value) return
          el.value = next
          el.form?.requestSubmit()
        }}
      >
        <SelectTrigger
          aria-label={ariaLabel}
          className="h-8 w-full rounded-md bg-background px-2 dark:bg-background"
        >
          <SelectValue>{(v: string) => <Choice option={byValue.get(v)} />}</SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} className="w-auto max-w-72 min-w-(--anchor-width)">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              <Choice option={o} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}

function Choice({ option }: { option: ShellOption | undefined }) {
  if (!option) return null
  return (
    <>
      {option.swatch ? <BrandMark name={option.label} swatch={option.swatch} /> : null}
      <span className="truncate">{option.label}</span>
    </>
  )
}
