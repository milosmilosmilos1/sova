'use client'

import { useTranslations } from 'next-intl'

/** Greška iz zahteva; poruka dolazi sa servera, a bez nje opšta poruka na jeziku interfejsa. */
export function ErrorBox({ error }: { error: unknown }) {
  const t = useTranslations('common')
  if (!error) return null
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {error instanceof Error && error.message ? error.message : t('error')}
    </div>
  )
}
