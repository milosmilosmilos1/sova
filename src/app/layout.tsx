import type { Metadata, Viewport } from 'next'
import { Geist_Mono, Inter } from 'next/font/google'
import { headers } from 'next/headers'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'

import { MaintenanceBanner } from '@/components/maintenance-banner'
import { Providers } from '@/components/providers'
import { isIndexableHost, siteUrl } from '@/lib/seo'

import './globals.css'

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: 'Sova', template: '%s · Sova' },
  description:
    'Unesite sajt, Sova vodi vaše društvene mreže: strategija, objave, vizuali, zakazivanje, analitika.',
  applicationName: 'Sova',
  openGraph: { siteName: 'Sova', locale: 'sr_RS', type: 'website' },
  twitter: { card: 'summary_large_image' },
  // pregledi i staging se ne indeksiraju, samo pravi domen (D-095)
  ...(isIndexableHost() ? {} : { robots: { index: false, follow: false } }),
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const locale = await getLocale()
  // CSP nonce iz proxy.ts: inline skripta next-themes-a mora da ga nosi.
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <Providers nonce={nonce}>
            <MaintenanceBanner />
            {children}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
