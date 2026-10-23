'use client'

import { useRef } from 'react'

/** <select> koji odmah šalje svoju formu (server action) pri promeni. */
export function AutoSubmitSelect({
  name,
  value,
  options,
  ariaLabel,
  className,
}: {
  name: string
  value: string
  options: Array<{ value: string; label: string }>
  ariaLabel: string
  className?: string
}) {
  const ref = useRef<HTMLSelectElement>(null)
  return (
    <select
      ref={ref}
      name={name}
      defaultValue={value}
      aria-label={ariaLabel}
      onChange={() => ref.current?.form?.requestSubmit()}
      className={
        className ??
        'h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
      }
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
