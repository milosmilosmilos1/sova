'use client'

import { useEffect } from 'react'

/** Registracija service worker-a (D-118): obaveštenja na telefonu i instalacija; strane se ne keširaju. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => undefined)
  }, [])
  return null
}
