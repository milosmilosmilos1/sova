'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { ApiResponse } from '@/lib/api/response'

/** Traka „Gledate kao <email> — Izađi” na svakoj strani tokom impersonacije (brif 16). */
export function ImpersonationBanner({
  userEmail,
  readOnly,
  expiresAt,
}: {
  userEmail: string
  readOnly: boolean
  expiresAt: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const until = new Date(expiresAt).toLocaleTimeString('sr-Latn-RS', { hour: '2-digit', minute: '2-digit' })
  async function exit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/impersonation/exit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      const data = (await res.json()) as ApiResponse<{ redirect: string }>
      if (!data.ok) throw new Error(data.error.message)
      router.push(data.data.redirect as Route)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Izlaz nije uspeo.')
      setBusy(false)
    }
  }
  return (
    <div
      role="status"
      className={`sticky top-0 z-50 flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-sm ${readOnly ? 'bg-amber-400 text-amber-950' : 'bg-red-600 text-white'}`}
    >
      <span>
        Gledate kao <strong>{userEmail}</strong> ·{' '}
        {readOnly ? 'samo čitanje' : 'pun režim (izmene su dozvoljene)'} · ističe u {until}
      </span>
      <button
        type="button"
        onClick={exit}
        disabled={busy}
        className="rounded-md border border-current px-3 py-0.5 font-medium hover:bg-black/10 disabled:opacity-60"
      >
        {busy ? 'Izlazim…' : 'Izađi'}
      </button>
      {error ? <span className="w-full text-center text-xs">{error}</span> : null}
    </div>
  )
}
