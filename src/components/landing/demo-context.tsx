'use client'

import { faArrowRight, faGlobe } from '@fortawesome/free-solid-svg-icons'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'

import { cn } from 'cn'

import { cleanDomain, DEMO_DOMAIN } from './demo-domain'
import { Fa } from './icons'

/**
 * Demo prikaz u hero delu i dve forme za adresu dele stanje (D-098): unos adrese pokreće demo
 * od prvog koraka sa tom adresom. Nema poziva serveru; ostatak demoa je primer brenda.
 */
interface DemoValue {
  domain: string
  /** raste pri svakom pokretanju, demo se tada vraća na prvi korak */
  run: number
  start: (input: string) => void
}

const DemoContext = createContext<DemoValue | null>(null)

export function DemoProvider({ children }: { children: ReactNode }) {
  const [domain, setDomain] = useState(DEMO_DOMAIN)
  const [run, setRun] = useState(0)
  const start = useCallback((input: string) => {
    const clean = cleanDomain(input)
    if (clean) setDomain(clean)
    setRun((r) => r + 1)
  }, [])
  const value = useMemo(() => ({ domain, run, start }), [domain, run, start])
  return <DemoContext value={value}>{children}</DemoContext>
}

export function useDemo(): DemoValue {
  const value = useContext(DemoContext)
  if (!value) throw new Error('useDemo traži DemoProvider')
  return value
}

/** Forma „unesite sajt”: u hero delu sa prefiksom https://, na dnu strane sa skrolom na demo. */
export function UrlForm({ variant }: { variant: 'hero' | 'cta' }) {
  const { start } = useDemo()
  const [value, setValue] = useState('')
  const hero = variant === 'hero'
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    start(value)
    if (!hero) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
    }
  }
  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        'flex items-center gap-2 rounded-[14px] border bg-l-card p-1.5 text-left transition-[border-color,box-shadow] duration-200 focus-within:border-l-accent/50 focus-within:shadow-[0_0_0_4px_rgba(61,169,252,0.08)]',
        hero
          ? 'mt-[34px] max-w-[520px] border-l-line/20 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]'
          : 'mt-8 w-full max-w-[500px] border-l-line/22',
      )}
    >
      <Fa icon={faGlobe} className="ml-3 text-l-dim" style={{ fontSize: 14 }} />
      {hero ? <span className="text-[15px] text-l-dim">https://</span> : null}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="vasafirma.rs"
        aria-label="Adresa vašeg sajta"
        inputMode="url"
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        className={cn(
          'h-11 min-w-0 flex-1 border-0 bg-transparent text-[15px] text-l-text outline-none',
          hero && '-ml-1',
        )}
      />
      <button
        type="submit"
        className="flex h-11 cursor-pointer items-center gap-2 rounded-[10px] bg-l-accent px-[18px] text-[14.5px] font-semibold whitespace-nowrap text-l-on-accent transition-colors duration-200 hover:bg-l-accent-hover"
      >
        {hero ? 'Isprobajte' : 'Počnite besplatno'}
        <Fa icon={faArrowRight} style={{ fontSize: 12 }} />
      </button>
    </form>
  )
}
