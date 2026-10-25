import type { Route } from 'next'
import { JetBrains_Mono, Onest } from 'next/font/google'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { OwlMark } from '@/components/landing/owl-mark'
import { company } from '@/config/company'
import { isFeatureEnabled } from '@/lib/flags'
import { cn } from 'cn'

// Ćirilica se ne učitava unapred, ali je u fontu i stiže kad je strana zatraži (unicode-range).
const onest = Onest({ variable: '--font-onest', subsets: ['latin', 'latin-ext'], display: 'swap' })
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jbmono',
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
})

/**
 * Javne strane u izgledu landinga (D-098): tamna paleta, Onest, lepljivo zaglavlje sa sovom.
 * `dark` ostaje zbog shadcn komponenti na prijavi, registraciji i pravnim stranama.
 */
export default async function PublicLayout({ children }: LayoutProps<'/'>) {
  const [t, registrationOpen] = await Promise.all([
    getTranslations('nav'),
    isFeatureEnabled('registration_open'),
  ])
  const sections = [
    { href: '/#funkcije' as Route, label: t('features') },
    { href: '/#mreze' as Route, label: t('networks') },
    { href: '/#kako-radi' as Route, label: t('how') },
    { href: '/#cene' as Route, label: t('pricing') },
    { href: '/#pitanja' as Route, label: t('faq') },
  ]
  const footerLinks = [
    { href: '/privacy' as Route, label: t('privacy') },
    { href: '/terms' as Route, label: t('terms') },
    { href: '/data-deletion' as Route, label: t('dataDeletion') },
    { href: '/kontakt' as Route, label: t('contact') },
  ]
  return (
    <div
      className={cn(
        onest.variable,
        jetbrainsMono.variable,
        'dark l-root flex min-h-full flex-1 flex-col overflow-x-clip bg-l-bg font-l-sans text-l-text',
      )}
    >
      <header className="sticky top-0 z-50 border-b border-l-line/10 bg-l-bg/78 backdrop-blur-[14px]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-3">
          <Link
            href={'/#top' as Route}
            className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.01em] text-l-text"
          >
            <OwlMark size="header" />
            <span>Sova</span>
          </Link>
          <nav
            aria-label="Sekcije"
            className="hidden gap-0.5 rounded-xl border border-l-line/12 bg-l-card/60 p-1 md:flex"
          >
            {sections.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="rounded-lg px-3.5 py-[7px] text-sm text-l-muted transition-[color,background-color] duration-200 hover:bg-l-line/8 hover:text-l-text"
              >
                {s.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <Link
              href="/login"
              className="rounded-[9px] px-3.5 py-2 text-sm text-l-text-2 transition-[color,background-color] duration-200 hover:bg-l-line/8 hover:text-white"
            >
              {t('login')}
            </Link>
            <Link
              href={(registrationOpen ? '/register' : '/#cene') as Route}
              className="rounded-[10px] bg-l-accent px-4 py-[9px] text-sm font-semibold text-l-on-accent transition-[background-color] duration-200 hover:bg-l-accent-hover"
            >
              {t('register')}
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-l-line/10 px-6 py-7">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div className="flex items-center gap-3.5">
            <span className="flex items-center gap-[9px] text-[15px] font-semibold">
              <OwlMark size="footer" />
              Sova
            </span>
            <span className="text-[13px] text-l-dim">
              © {new Date().getFullYear()} {company.legalName}
            </span>
          </div>
          <nav aria-label="Pravne informacije" className="flex flex-wrap gap-x-[22px] gap-y-2 text-[13.5px]">
            {footerLinks.map((l) => (
              <Link key={l.href} href={l.href} className="text-l-muted transition-colors hover:text-l-text">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  )
}
