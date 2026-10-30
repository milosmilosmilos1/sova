'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** Link u bočnoj navigaciji; aktivno stanje računa na klijentu (usePathname), ne na serveru. */
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
  return (
    <Link
      href={href}
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
