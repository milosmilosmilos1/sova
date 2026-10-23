'use client'

import * as Sentry from '@sentry/nextjs'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations()
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t('errors.errorTitle')}</h1>
      <p className="max-w-md text-muted-foreground">{t('errors.errorText')}</p>
      {error.digest ? (
        <p className="font-mono text-xs text-muted-foreground">{t('common.errorId', { id: error.digest })}</p>
      ) : null}
      <Button onClick={reset}>{t('common.retry')}</Button>
    </main>
  )
}
