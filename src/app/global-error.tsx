'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

/**
 * Poslednja linija odbrane: hvata greške u root layoutu. Nema provider-a,
 * pa su tekstovi hardkodovani na srpskom.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="sr-Latn">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem 1rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Nešto je pošlo naopako</h1>
        <p style={{ color: '#666', maxWidth: 480, margin: '1rem auto' }}>
          Greška je zabeležena. Pokušajte ponovo, a ako se ponavlja javite podršci sa ID-jem ispod.
        </p>
        {error.digest ? (
          <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#666' }}>ID greške: {error.digest}</p>
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
          Pokušajte ponovo
        </button>
      </body>
    </html>
  )
}
