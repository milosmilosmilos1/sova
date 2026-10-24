import type { Route } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { SovaLogo } from '@/components/brand/sova-logo'
import { company } from '@/config/company'

/** Javne strane su uvek u tamnoj temi (faza 14, D-091): mreža, sjaj i plavi akcenat iz reference. */
export default async function PublicLayout({ children }: LayoutProps<'/'>) {
  const t = await getTranslations('nav')
  const sections = [
    { href: '/#funkcije' as Route, label: t('features') },
    { href: '/#kako-radi' as Route, label: t('how') },
    { href: '/#cene' as Route, label: t('pricing') },
    { href: '/#pitanja' as Route, label: t('faq') },
  ]
  return (
    <div className="dark flex min-h-full flex-1 flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" aria-label="Sova, početna">
            <SovaLogo />
          </Link>
          <nav
            aria-label="Sekcije"
            className="hidden items-center rounded-lg border border-border bg-card/40 p-0.5 text-sm md:flex"
          >
            {sections.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {s.label}
              </Link>
            ))}
          </nav>
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/login"
              className="rounded-md border border-border px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              {t('login')}
            </Link>
            <Link
              href="/register"
              className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground shadow-[0_0_24px_-8px_var(--glow)] transition hover:brightness-110"
            >
              {t('register')}
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <SovaLogo className="text-base text-foreground" />
            <span>
              © {new Date().getFullYear()} {company.legalName}
            </span>
          </div>
          <nav className="flex flex-wrap gap-4">
            <Link href="/privacy" className="hover:text-foreground">
              {t('privacy')}
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              {t('terms')}
            </Link>
            <Link href="/data-deletion" className="hover:text-foreground">
              {t('dataDeletion')}
            </Link>
            <a href={`mailto:${company.supportEmail}`} className="hover:text-foreground">
              {t('contact')}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
