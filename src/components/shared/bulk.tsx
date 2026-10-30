'use client'

import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Označavanje više stavki u listama (D-119): kvačica po stavci, „označi sve” sa međustanjem i traka
 * sa radnjama za označeno (brisanje i ostalo). Označene stavke koje nestanu iz liste same se brišu
 * iz izbora, pa radnja nikad ne ide na nešto što se više ne vidi.
 */
export interface Selection {
  selected: Set<string>
  count: number
  all: boolean
  some: boolean
  has: (id: string) => boolean
  toggle: (id: string) => void
  setAll: (on: boolean) => void
  clear: () => void
}

export function useSelection(ids: readonly string[]): Selection {
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const selected = useMemo(() => new Set(ids.filter((id) => picked.has(id))), [ids, picked])
  return {
    selected,
    count: selected.size,
    all: ids.length > 0 && selected.size === ids.length,
    some: selected.size > 0 && selected.size < ids.length,
    has: (id) => selected.has(id),
    toggle: (id) =>
      setPicked((cur) => {
        const next = new Set(cur)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    setAll: (on) => setPicked(on ? new Set(ids) : new Set()),
    clear: () => setPicked(new Set()),
  }
}

/** Kvačica „označi sve”: puna kad je sve označeno, crtica kad je deo. */
export function SelectAllBox({
  selection,
  disabled,
  className,
}: {
  selection: Selection
  disabled?: boolean
  className?: string
}) {
  const t = useTranslations('bulk')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selection.some
  }, [selection.some])
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm', className)}>
      <input
        ref={ref}
        type="checkbox"
        className="size-4 accent-primary"
        checked={selection.all}
        disabled={disabled}
        onChange={(e) => selection.setAll(e.target.checked)}
        aria-checked={selection.some ? 'mixed' : selection.all}
      />
      {t('selectAll')}
    </label>
  )
}

/** Kvačica jedne stavke; `label` je ime stavke za čitače ekrana. */
export function SelectBox({
  selection,
  id,
  label,
  disabled,
  className,
}: {
  selection: Selection
  id: string
  label: string
  disabled?: boolean
  className?: string
}) {
  const t = useTranslations('bulk')
  return (
    <input
      type="checkbox"
      className={cn('size-4 shrink-0 cursor-pointer accent-primary', className)}
      checked={selection.has(id)}
      disabled={disabled}
      onChange={() => selection.toggle(id)}
      onClick={(e) => e.stopPropagation()}
      aria-label={t('select', { name: label })}
    />
  )
}

/** Traka sa radnjama: vidi se dok je bar jedna stavka označena. */
export function BulkBar({ selection, children }: { selection: Selection; children: ReactNode }) {
  const t = useTranslations('bulk')
  if (!selection.count) return null
  return (
    <div
      role="region"
      aria-label={t('bar')}
      className="sticky bottom-4 z-30 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border bg-popover px-3 py-2 text-sm shadow-lg"
    >
      <span className="font-medium tabular-nums">{t('selected', { count: selection.count })}</span>
      <span aria-hidden className="h-5 w-px bg-border" />
      {children}
      <button
        type="button"
        onClick={selection.clear}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted"
      >
        <X className="size-4" aria-hidden />
        {t('clear')}
      </button>
    </div>
  )
}

/** Radnja nad više stavki redom; vraća koliko je uspelo i poruke za ono što nije. */
export async function runBulk(
  ids: readonly string[],
  action: (id: string) => Promise<unknown>,
  concurrency = 4,
): Promise<{ done: number; failed: Array<{ id: string; message: string }> }> {
  const queue = [...ids]
  const failed: Array<{ id: string; message: string }> = []
  let done = 0
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        await action(id)
        done++
      } catch (error) {
        failed.push({ id, message: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker))
  return { done, failed }
}
