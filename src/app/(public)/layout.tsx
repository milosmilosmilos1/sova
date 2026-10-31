import type { Route } from 'next'
import { JetBrains_Mono, Onest } from 'next/font/google'
import { headers } from 'next/headers'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

import { PublicLocaleSwitcher } from '@/components/landing/locale-links'
import { MobileNav } from '@/components/landing/mobile-nav'
import { OwlMark } from '@/components/landing/owl-mark'
import { company } from '@/config/company'
import { localePath, PATH_HEADER, SECTION_IDS } from '@/i18n/paths'
import { isFeatureEnabled } from '@/lib/flags'
import { cn } from '@/lib/utils'

// Ćirilica se ne učitava unapred, ali je u fontu i stiže kad je strana zatraži (unicode-range).
const onest = Onest({ variable: '--font-onest', subsets: ['latin', 'latin-ext'], display: 'swap' })
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jbmono',
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
})

/**
 * Javne strane u izgledu landinga (D-098): tamna paleta, Onest, lepljivo zaglavlje sa sovom.
 * `dark` ostaje zbog shadcn komponenti na prijavi, registraciji i pravnim stranama. Svaki link nosi
 * jezik strane (D-130: srpski bez prefiksa, /en, /uk), a birač jezika vodi na istu stranu.
 */
export default async function PublicLayout({ children }: LayoutProps<'/'>) {
  const [t, locale, registrationOpen, h] = await Promise.all([
    getTranslations('nav'),
    getLocale(),
    isFeatureEnabled('registration_open'),
    headers(),
  ])
  const ids = SECTION_IDS[locale]
  const href = (path: string) => localePath(locale, path) as Route
  const sections = [
    { href: href(`/#${ids.features}`), label: t('features') },
    { href: href(`/#${ids.networks}`), label: t('networks') },
    { href: href(`/#${ids.how}`), label: t('how') },
    { href: href(`/#${ids.pricing}`), label: t('pricing') },
    { href: href(`/#${ids.faq}`), label: t('faq') },
  ]
  const footerLinks = [
    { href: href('/privacy'), label: t('privacy') },
    { href: href('/terms'), label: t('terms') },
    { href: href('/data-deletion'), label: t('dataDeletion') },
    { href: href('/kontakt'), label: t('contact') },
  ]
  const path = h.get(PATH_HEADER) ?? '/'
  const switcher = (className?: string) => (
    <PublicLocaleSwitcher path={path} current={locale} label={t('language')} className={className} />
  )
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
            href={href('/#top')}
            className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.01em] text-l-text"
          >
            <OwlMark size="header" />
            <span>Sova</span>
          </Link>
          <nav
            aria-label={t('sections')}
            className="hidden gap-0.5 rounded-xl border border-l-line/12 bg-l-card/60 p-1 lg:flex"
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
            {switcher('hidden lg:flex')}
            {/* na telefonu je Prijava u meniju, da zaglavlje ostane u jednom redu */}
            <Link
              href={href('/login')}
              className="hidden rounded-[9px] px-3.5 py-2 text-sm text-l-text-2 transition-[color,background-color] duration-200 hover:bg-l-line/8 hover:text-white sm:block"
            >
              {t('login')}
            </Link>
            <Link
              href={registrationOpen ? href('/register') : href(`/#${ids.pricing}`)}
              className="rounded-[10px] bg-l-accent px-4 py-[9px] text-sm font-semibold text-l-on-accent transition-[background-color] duration-200 hover:bg-l-accent-hover"
            >
              {t('register')}
            </Link>
            <MobileNav
              links={sections}
              login={{ href: href('/login'), label: t('login') }}
              labels={{ menu: t('menu'), sections: t('sections') }}
              switcher={switcher('w-fit')}
            />
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
          <div className="flex flex-wrap items-center gap-x-[22px] gap-y-3">
            <nav aria-label={t('legal')} className="flex flex-wrap gap-x-[22px] gap-y-2 text-[13.5px]">
              {footerLinks.map((l) => (
                <Link key={l.href} href={l.href} className="text-l-muted transition-colors hover:text-l-text">
                  {l.label}
                </Link>
              ))}
            </nav>
            {switcher()}
          </div>
        </div>
      </footer>
    </div>
  )
}
