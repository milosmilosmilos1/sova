'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { ApiResponse } from '@/lib/api/response'

/** Prenos vlasništva (samo vlasnik): novi vlasnik je postojeći član, vi postajete administrator. */
export function TransferOwnershipForm({
  workspaceId,
  members,
}: {
  workspaceId: string
  members: Array<{ userId: string; label: string }>
}) {
  const t = useTranslations('team.transfer')
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function transfer() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/transfer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = (await res.json()) as ApiResponse<{ transferred: boolean }>
      if (!data.ok) throw new Error(data.error.message)
      setMessage({ ok: true, text: t('done') })
      router.refresh()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : t('failed') })
    } finally {
      setBusy(false)
    }
  }

  if (!members.length) return <p className="text-sm text-muted-foreground">{t('noMembers')}</p>
  return (
    <div className="space-y-3 text-sm">
      <select
        className="h-9 w-full max-w-sm rounded-md border bg-background px-2"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        aria-label={t('newOwner')}
      >
        <option value="">{t('choose')}</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.label}
          </option>
        ))}
      </select>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>{t('confirm')}</span>
      </label>
      <Button variant="outline" disabled={busy || !userId || !confirmed} onClick={() => void transfer()}>
        {busy ? t('pending') : t('submit')}
      </Button>
      {message ? (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'text-success' : 'text-destructive'}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  )
}
