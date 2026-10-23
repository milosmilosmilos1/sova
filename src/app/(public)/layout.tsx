import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { company } from '@/config/company'

export default async function PublicLayout({ children }: LayoutProps<'/'>) {
  const t = await getTranslations('nav')
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Sova
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/login" className="text-muted-foreground hover:text-foreground">
              {t('login')}
            </Link>
            <Link
              href="/register"
              className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:opacity-90"
            >
              {t('register')}
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {company.legalName}
          </p>
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
