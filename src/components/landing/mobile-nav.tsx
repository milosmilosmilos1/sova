'use client'

import { faBars, faXmark } from '@fortawesome/free-solid-svg-icons'
import type { Route } from 'next'
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'

import { Fa } from './icons'

/**
 * Meni sekcija za telefon (D-098): ispod 768 px srednja navigacija nema mesta, pa linkovi idu
 * u padajući panel ispod zaglavlja (neprovidan: zamućenje ne radi unutar zaglavlja koje već ima
 * backdrop-filter). Zatvara se klikom na link, Escape-om i klikom van menija.
 */
export function MobileNav({ links, login }: { links: Array<{ href: Route; label: string }>; login: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  const item =
    'block rounded-lg px-3 py-3 text-[15px] text-l-text-2 transition-[color,background-color] duration-200 hover:bg-l-line/8 hover:text-white'
  return (
    <div ref={root} className="md:hidden">
      <button
        type="button"
        aria-label="Meni"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex size-10 cursor-pointer items-center justify-center rounded-[10px] border border-l-line/14 text-l-text-2 transition-[color,background-color] duration-200 hover:bg-l-line/8 hover:text-white"
      >
        <Fa icon={open ? faXmark : faBars} style={{ fontSize: 16 }} />
      </button>
      <nav
        id={id}
        aria-label="Sekcije"
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-l-line/10 bg-l-bg px-6 py-2 shadow-[0_24px_40px_-24px_rgba(0,0,0,0.8)]"
      >
        <ul className="flex flex-col">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} onClick={() => setOpen(false)} className={item}>
                {l.label}
              </Link>
            </li>
          ))}
          <li className="mt-1 border-t border-l-line/10 pt-1 sm:hidden">
            <Link href="/login" onClick={() => setOpen(false)} className={item}>
              {login}
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  )
}
