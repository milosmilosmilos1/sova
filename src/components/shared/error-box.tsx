'use client'

import { useTranslations } from 'next-intl'

import { HttpError } from '@/components/shared/api-client'

/**
 * Greška iz zahteva; poruka dolazi sa servera, a bez nje poruka na jeziku interfejsa. Kad Netlify
 * prekine zahtev posle 30 sekundi (502 ili 504), deo posla je možda već urađen (D-126).
 */
export function ErrorBox({ error }: { error: unknown }) {
  const t = useTranslations('common')
  if (!error) return null
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {error instanceof Error && error.message
        ? error.message
        : t(error instanceof HttpError && [502, 504].includes(error.status) ? 'timeout' : 'error')}
    </div>
  )
}
