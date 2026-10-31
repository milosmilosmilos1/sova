'use client'

import { locales, type AppLocale } from '@/i18n/config'
import { localePath, splitLocalePath } from '@/i18n/paths'
import { cn } from '@/lib/utils'

/** Oznake jezika: kratka u zaglavlju, puno ime za čitače ekrana, kod jezika za pregledač. */
const SHORT: Record<AppLocale, string> = { 'sr-Latn': 'SR', en: 'EN', uk: 'UA' }
const NAME: Record<AppLocale, string> = { 'sr-Latn': 'Srpski', en: 'English', uk: 'Українська' }
const LANG: Record<AppLocale, string> = { 'sr-Latn': 'sr-Latn', en: 'en', uk: 'uk' }

/**
 * Ista strana na drugom jeziku (D-130). Srpska adresa nema prefiks, pa nosi `?lang=` da prepiše
 * zapamćen izbor; proxy tada pamti srpski i vodi na čistu adresu.
 */
function hrefFor(target: AppLocale, path: string, search: string): string {
  const params = new URLSearchParams(search)
  params.delete('lang')
  if (target === 'sr-Latn') params.set('lang', 'sr-Latn')
  const query = params.toString()
  return `${localePath(target, path)}${query ? `?${query}` : ''}`
}

/**
 * Birač jezika javnog sajta. Adresa u linku je za stranu na kojoj je zaglavlje nacrtano; pri kliku
 * se računa iz adrese u pregledaču, jer zaglavlje ostaje isto dok se kreće po sajtu.
 */
export function PublicLocaleSwitcher({
  path,
  current,
  label,
  className,
}: {
  /** interna putanja strane (bez prefiksa jezika) */
  path: string
  current: AppLocale
  label: string
  className?: string
}) {
  return (
    <nav
      aria-label={label}
      className={cn('flex items-center gap-0.5 rounded-[10px] border border-l-line/12 p-0.5', className)}
    >
      {locales.map((l) => (
        <a
          key={l}
          href={hrefFor(l, path, '')}
          hrefLang={LANG[l]}
          lang={LANG[l]}
          aria-label={NAME[l]}
          title={NAME[l]}
          aria-current={l === current ? 'true' : undefined}
          onClick={(e) => {
            // običan link (ceo zahtev, proxy pamti izbor), ali sa adresom strane na kojoj je korisnik sada
            const visible = window.location.pathname
            const where = splitLocalePath(visible)?.path ?? visible
            e.currentTarget.href = `${hrefFor(l, where, window.location.search)}${window.location.hash}`
          }}
          className={cn(
            'rounded-lg px-2 py-1 text-xs font-semibold tracking-wide transition-[color,background-color] duration-200',
            l === current ? 'bg-l-line/12 text-white' : 'text-l-muted hover:bg-l-line/8 hover:text-l-text',
          )}
        >
          {SHORT[l]}
        </a>
      ))}
    </nav>
  )
}
