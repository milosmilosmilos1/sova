'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** Link u bočnoj navigaciji; aktivno stanje računa na klijentu (usePathname), ne na serveru. */
export function NavLink({ href, exact, children }: { href: Route; exact?: boolean; children: ReactNode }) {
  const pathname = usePathname()
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap hover:bg-sidebar-accent',
        active && 'bg-sidebar-accent font-medium',
      )}
    >
      {children}
    </Link>
  )
}

/** Skriveno polje sa trenutnom putanjom za server action koji vraća korisnika na istu stranu. */
export function CurrentPathInput({ name = 'next' }: { name?: string }) {
  const pathname = usePathname()
  return <input type="hidden" name={name} value={pathname} />
}
