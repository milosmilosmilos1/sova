'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('security.mfa')
  const tc = useTranslations('common')
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
      setMessage(e instanceof Error ? mapMfaError(e.message, t) : t('failed'))
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
      return t('enabled')
    })

  const disable = (factorId: string) =>
    run(async () => {
      if (!window.confirm(t('confirmDisable'))) return null
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) throw error
      router.refresh()
      return t('disabled')
    })

  if (factors.isPending) return <p className="text-sm text-muted-foreground">{t('loading')}</p>
  if (factors.isError)
    return (
      <div className="space-y-2 text-sm">
        <p className="text-destructive">{t('loadFailed')}</p>
        <Button variant="outline" size="sm" onClick={() => void factors.refetch()}>
          {tc('retry')}
        </Button>
      </div>
    )

  const codeInput = (onSubmit: () => void) => (
    <div className="flex max-w-xs items-end gap-2">
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="mfa-code">{t('codeLabel')}</Label>
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
        {t('confirm')}
      </Button>
    </div>
  )

  return (
    <div className="space-y-4 text-sm">
      {reason === 'admin' ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
          {t('adminRequired')}
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
            {t.rich('on', { strong: (chunks) => <strong>{chunks}</strong> })}{' '}
            {currentLevel === 'aal2' ? t('sessionVerified') : t('sessionNotVerified')}
          </p>
          {currentLevel !== 'aal2' ? codeInput(() => void verifyCode(verified.id)) : null}
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void disable(verified.id)}>
            {t('turnOff')}
          </Button>
        </div>
      ) : enroll ? (
        <div className="space-y-3">
          <p>{t('scan')}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enroll.qr}
            alt={t('qrAlt')}
            width={180}
            height={180}
            className="rounded-md border bg-white p-2"
          />
          <p className="text-xs text-muted-foreground">
            {t('manual')} <code className="font-mono">{enroll.secret}</code>
          </p>
          {codeInput(() => void verifyCode(enroll.factorId))}
        </div>
      ) : (
        <div className="space-y-3">
          <p>{t('off')}</p>
          <Button disabled={busy} onClick={() => void startEnroll()}>
            {t('turnOn')}
          </Button>
        </div>
      )}
    </div>
  )
}

function mapMfaError(message: string, t: (key: 'wrongCode' | 'needCode') => string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid totp') || m.includes('invalid code')) return t('wrongCode')
  if (m.includes('aal2')) return t('needCode')
  return message
}
