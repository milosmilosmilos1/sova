'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

interface Factor {
  id: string
  status: 'verified' | 'unverified'
}

const FACTORS_KEY = ['mfa', 'factors'] as const

async function fetchFactors(): Promise<Factor[]> {
  const supabase = createSupabaseBrowserClient()
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return (data.totp ?? []).map((f) => ({ id: f.id, status: f.status }))
}

/**
 * TOTP (aplikacija za kodove) preko browser Supabase klijenta: enroll, verify, unenroll.
 * Posle promene nivoa sesije osvežava server (router.refresh) da admin gate vidi AAL2.
 */
export function MfaPanel({ currentLevel, reason }: { currentLevel: 'aal1' | 'aal2'; reason?: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const factors = useQuery({ queryKey: FACTORS_KEY, queryFn: fetchFactors, retry: 1 })
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const verified = factors.data?.find((f) => f.status === 'verified')

  async function run(task: () => Promise<string | null>) {
    setBusy(true)
    setMessage(null)
    try {
      const result = await task()
      if (result) setMessage(result)
      await queryClient.invalidateQueries({ queryKey: FACTORS_KEY })
    } catch (e) {
      setMessage(e instanceof Error ? mapMfaError(e.message) : 'Radnja nije uspela.')
    } finally {
      setBusy(false)
    }
  }

  const startEnroll = () =>
    run(async () => {
      const supabase = createSupabaseBrowserClient()
      for (const f of (factors.data ?? []).filter((x) => x.status === 'unverified')) {
        await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Sova' })
      if (error) throw error
      setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
      return null
    })

  const verifyCode = (factorId: string) =>
    run(async () => {
      const supabase = createSupabaseBrowserClient()
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
      if (chErr) throw chErr
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      })
      if (error) throw error
      setEnroll(null)
      setCode('')
      router.refresh()
      return 'Dvofaktorska zaštita je uključena i potvrđena za ovu sesiju.'
    })

  const disable = (factorId: string) =>
    run(async () => {
      if (!window.confirm('Isključiti dvofaktorsku zaštitu?')) return null
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) throw error
      router.refresh()
      return 'Dvofaktorska zaštita je isključena.'
    })

  if (factors.isPending) return <p className="text-sm text-muted-foreground">Učitavam…</p>
  if (factors.isError)
    return (
      <div className="space-y-2 text-sm">
        <p className="text-destructive">Stanje zaštite nije učitano.</p>
        <Button variant="outline" size="sm" onClick={() => void factors.refetch()}>
          Pokušajte ponovo
        </Button>
      </div>
    )

  const codeInput = (onSubmit: () => void) => (
    <div className="flex max-w-xs items-end gap-2">
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="mfa-code">Kod iz aplikacije</Label>
        <Input
          id="mfa-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={6}
        />
      </div>
      <Button disabled={busy || code.trim().length < 6} onClick={onSubmit}>
        Potvrdite
      </Button>
    </div>
  )

  return (
    <div className="space-y-4 text-sm">
      {reason === 'admin' ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
          Admin panel traži dvofaktorsku zaštitu i potvrdu koda u ovoj sesiji.
        </p>
      ) : null}
      {message ? (
        <p role="status" className="rounded-md border px-3 py-2">
          {message}
        </p>
      ) : null}

      {verified ? (
        <div className="space-y-3">
          <p>
            Dvofaktorska zaštita je <strong>uključena</strong>.{' '}
            {currentLevel === 'aal2'
              ? 'Ova sesija je potvrđena kodom.'
              : 'Ova sesija još nije potvrđena kodom.'}
          </p>
          {currentLevel !== 'aal2' ? codeInput(() => void verifyCode(verified.id)) : null}
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void disable(verified.id)}>
            Isključite zaštitu
          </Button>
        </div>
      ) : enroll ? (
        <div className="space-y-3">
          <p>
            Skenirajte kod aplikacijom (Google Authenticator, 1Password, Authy…), pa unesite 6-cifreni kod.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enroll.qr}
            alt="QR kod za aplikaciju za autentifikaciju"
            width={180}
            height={180}
            className="rounded-md border bg-white p-2"
          />
          <p className="text-xs text-muted-foreground">
            Ručni unos: <code className="font-mono">{enroll.secret}</code>
          </p>
          {codeInput(() => void verifyCode(enroll.factorId))}
        </div>
      ) : (
        <div className="space-y-3">
          <p>Dvofaktorska zaštita je isključena. Preporučujemo je svima, a obavezna je za admin panel.</p>
          <Button disabled={busy} onClick={() => void startEnroll()}>
            Uključite dvofaktorsku zaštitu
          </Button>
        </div>
      )}
    </div>
  )
}

function mapMfaError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid totp') || m.includes('invalid code'))
    return 'Kod nije tačan. Proverite vreme na telefonu i pokušajte ponovo.'
  if (m.includes('aal2')) return 'Za ovu radnju prvo potvrdite kod iz aplikacije.'
  return message
}
