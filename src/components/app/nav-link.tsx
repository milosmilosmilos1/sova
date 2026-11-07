'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react'

import { cn } from '@/lib/utils'

const HOVER_QUERY = '(hover: hover) and (pointer: fine)'

function subscribeHover(onChange: () => void) {
  const media = window.matchMedia(HOVER_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

/** Uređaj sa mišem; na serveru se pretpostavlja miš, pa se ništa ne učitava unapred pre hidratacije. */
function useCanHover(): boolean {
  return useSyncExternalStore(
    subscribeHover,
    () => window.matchMedia(HOVER_QUERY).matches,
    () => true,
  )
}

/**
 * Aktivna stavka trake koja se skroluje (meni na telefonu, kartice) dolazi u vidno polje trake.
 * Pomera se samo traka, ne cela strana, da povratak unazad zadrži položaj strane.
 */
export function useKeepInView(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = ref.current
    const strip = el?.closest('nav')
    if (!active || !el || !strip) return
    const box = strip.getBoundingClientRect()
    const item = el.getBoundingClientRect()
    if (item.left < box.left || item.right > box.right)
      strip.scrollLeft += item.left - box.left - (box.width - item.width) / 2
    if (item.top < box.top || item.bottom > box.bottom)
      strip.scrollTop += item.top - box.top - (box.height - item.height) / 2
  }, [ref, active])
}

/**
 * Link u bočnoj navigaciji; aktivno stanje računa na klijentu (usePathname), ne na serveru.
 * Na računaru se strana učitava unapred tek kad miš pređe preko linka ili link dobije fokus (D-164):
 * ranije je svaki vidljiv link (oko 20) odmah slao po dva zahteva serveru, baš dok se strana učitava.
 * Na telefonu nema prelaska mišem, pa ostaje učitavanje vidljivih linkova, da dodir odmah prikaže stranu.
 */
export function NavLink({
  href,
  exact,
  also = [],
  children,
}: {
  href: Route
  exact?: boolean
  /** druge putanje pod istom stavkom (npr. kartice „Brend i nalog”) */
  also?: string[]
  children: ReactNode
}) {
  const pathname = usePathname()
  const under = (path: string) => pathname === path || pathname.startsWith(`${path}/`)
  const active = exact ? pathname === href : under(href) || also.some(under)
  const ref = useRef<HTMLAnchorElement>(null)
  useKeepInView(ref, active)
  const canHover = useCanHover()
  const [intent, setIntent] = useState(false)
  const showIntent = () => setIntent(true)
  return (
    <Link
      ref={ref}
      href={href}
      prefetch={!canHover || intent ? null : false}
      onMouseEnter={showIntent}
      onFocus={showIntent}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm whitespace-nowrap text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
        active &&
          'bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary [&_svg]:text-sidebar-primary',
      )}
    >
      {children}
    </Link>
  )
}

/** Grupa linkova u bočnoj navigaciji; naslov grupe se vidi samo na širem ekranu. */
export function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-1 md:flex-col">
      <p className="hidden px-3 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase md:block">
        {label}
      </p>
      {children}
    </div>
  )
}

/** Skriveno polje sa trenutnom putanjom za server action koji vraća korisnika na istu stranu. */
export function CurrentPathInput({ name = 'next' }: { name?: string }) {
  const pathname = usePathname()
  return <input type="hidden" name={name} value={pathname} />
}
