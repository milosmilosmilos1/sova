'use client'

import { useEffect } from 'react'

/**
 * Odjava u svim tabovima (EDGE_CASES A6, A7): tab koji se odjavi ili obriše nalog šalje poruku kroz
 * BroadcastChannel; ostali tabovi idu na prijavu. Pri povratku fokusa tab proverava sesiju
 * (`/api/me`), pa i istekla sesija ili obrisan nalog vode na prijavu bez gubitka u tišini.
 */
export function AuthSync() {
  useEffect(() => {
    // puna navigacija: posle odjave klijentsko stanje (keš upita) mora da nestane
    const toLogin = () => {
      const url = new URL('/login', window.location.origin)
      url.searchParams.set('next', window.location.pathname)
      window.location.replace(url.href)
    }
    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel('sova-auth')
      channel.onmessage = (e: MessageEvent<{ type?: string }>) => {
        if (e.data?.type === 'signed_out') toLogin()
      }
    } catch {
      channel = null
    }
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch('/api/me', { cache: 'no-store' })
        if (res.status === 401) toLogin()
      } catch {
        // mreža nedostupna: proverava se pri sledećem fokusu
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      channel?.close()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return null
}

/** Na strani za prijavu posle odjave: javlja ostalim tabovima da je sesija završena. */
export function SignedOutBroadcast() {
  useEffect(() => {
    try {
      const channel = new BroadcastChannel('sova-auth')
      channel.postMessage({ type: 'signed_out' })
      channel.close()
    } catch {
      // pregledač bez BroadcastChannel-a: ostali tabovi saznaju pri fokusu
    }
  }, [])
  return null
}
