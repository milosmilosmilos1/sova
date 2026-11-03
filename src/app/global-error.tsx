'use client'

import * as Sentry from '@sentry/nextjs'
import { unstable_isUnrecognizedActionError } from 'next/navigation'
import { useEffect, useSyncExternalStore } from 'react'

import { defaultLocale, isAppLocale, LOCALE_COOKIE, type AppLocale } from '@/i18n/config'
import { reloadForNewVersion } from '@/lib/stale-deploy'

/**
 * Poslednja linija odbrane: hvata greške u root layoutu. Nema provider-a (ni next-intl), pa su
 * tekstovi ovde na sva tri jezika; jezik se čita iz kolačića, a srpski je rezerva (D-130).
 */
const TEXT: Record<
  AppLocale,
  { title: string; text: string; errorId: string; retry: string; newVersion: string }
> = {
  'sr-Latn': {
    title: 'Nešto je pošlo naopako',
    text: 'Greška je zabeležena. Pokušajte ponovo, a ako se ponavlja javite podršci sa ID-jem ispod.',
    errorId: 'ID greške:',
    retry: 'Pokušajte ponovo',
    newVersion: 'Stigla je nova verzija Sove. Strana se osvežava.',
  },
  en: {
    title: 'Something went wrong',
    text: 'The error has been recorded. Try again, and if it keeps happening contact support with the ID below.',
    errorId: 'Error ID:',
    retry: 'Try again',
    newVersion: 'A new version of Sova is here. The page is refreshing.',
  },
  uk: {
    title: 'Щось пішло не так',
    text: 'Помилку записано. Спробуйте ще раз, а якщо вона повторюється, напишіть у підтримку з ID нижче.',
    errorId: 'ID помилки:',
    retry: 'Спробуйте ще раз',
    newVersion: 'Вийшла нова версія Sova. Сторінка оновлюється.',
  },
}

function cookieLocale(): AppLocale {
  const value = document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1)
  return isAppLocale(value) ? value : defaultLocale
}

// kolačić se ne prati: jezik se čita jednom, pri crtanju
const noSubscribe = () => () => {}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // na serveru nema kolačića iz pregledača: hidratacija ide na srpskom, pa odmah jezik iz kolačića
  const locale = useSyncExternalStore(noSubscribe, cookieLocale, () => defaultLocale)
  const t = TEXT[locale]

  const stale = unstable_isUnrecognizedActionError(error as unknown)
  useEffect(() => {
    // stara strana posle nove objave (D-141): osveži se sama, to nije greška za prijavu
    if (reloadForNewVersion(error) || stale) return
    Sentry.captureException(error)
  }, [error, stale])

  return (
    <html lang={locale}>
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem 1rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{stale ? t.newVersion : t.title}</h1>
        {stale ? null : <p style={{ color: '#666', maxWidth: 480, margin: '1rem auto' }}>{t.text}</p>}
        {error.digest ? (
          <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#666' }}>
            {t.errorId} {error.digest}
          </p>
        ) : null}
        <button
          onClick={reset}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            borderRadius: 6,
            border: '1px solid #ccc',
            cursor: 'pointer',
          }}
        >
          {t.retry}
        </button>
      </body>
    </html>
  )
}
