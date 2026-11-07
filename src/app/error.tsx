'use client'

import { unstable_isUnrecognizedActionError } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { reportError } from '@/lib/report-error'
import { reloadForNewVersion } from '@/lib/stale-deploy'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations()
  // provera nad `unknown`, da ne suzi tip greške ispod (Error i UnrecognizedActionError su istog oblika)
  const stale = unstable_isUnrecognizedActionError(error as unknown)
  useEffect(() => {
    // stara strana posle nove objave (D-141): osveži se sama, to nije greška za prijavu
    if (reloadForNewVersion(error) || stale) return
    void reportError(error)
  }, [error, stale])

  if (stale)
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t('errors.newVersionTitle')}</h1>
        <p className="max-w-md text-muted-foreground">{t('errors.newVersionText')}</p>
        <Button onClick={() => window.location.reload()}>{t('errors.reload')}</Button>
      </main>
    )

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
