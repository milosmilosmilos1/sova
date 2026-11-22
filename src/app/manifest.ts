import type { MetadataRoute } from 'next'
import { cookies } from 'next/headers'

import { defaultLocale, isAppLocale, LOCALE_COOKIE, type AppLocale } from '@/i18n/config'

const COPY: Record<
  AppLocale,
  { lang: string; description: string; approvals: string; inbox: string; studio: string }
> = {
  'sr-Latn': {
    lang: 'sr-Latn',
    description: 'Odobravajte nacrte i odgovarajte na poruke sa telefona.',
    approvals: 'Odobravanje',
    inbox: 'Inbox',
    studio: 'Studio',
  },
  en: {
    lang: 'en-GB',
    description: 'Approve drafts and reply to messages from your phone.',
    approvals: 'Approvals',
    inbox: 'Inbox',
    studio: 'Studio',
  },
}

/**
 * Instalacija na telefon (D-118): Sova se otvara kao aplikacija, pravo na odobravanje nacrta. Jezik
 * (D-130) iz kolačića; bez kolačića srpski (D-187).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale = isAppLocale(saved) ? saved : defaultLocale
  const copy = COPY[locale]
  return {
    id: '/app',
    name: 'Sova',
    short_name: 'Sova',
    description: copy.description,
    start_url: '/app/approvals',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#3DA9FC',
    lang: copy.lang,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: copy.approvals, url: '/app/approvals' },
      { name: copy.inbox, url: '/app/inbox' },
      { name: copy.studio, url: '/app/studio' },
    ],
  }
}
