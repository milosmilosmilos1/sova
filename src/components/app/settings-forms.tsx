'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useState } from 'react'

import { FormMessage, SubmitButton, TextField } from '@/components/forms/form-parts'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { ApiResponse } from '@/lib/api/response'
import { createBrandAction, updateProfileAction, updateWorkspaceAction } from '@/lib/auth/actions'
import { initialFormState } from '@/lib/auth/form-state'
import { pluralSr } from '@/lib/plural'

export const TIMEZONES = [
  'Europe/Belgrade',
  'Europe/Podgorica',
  'Europe/Sarajevo',
  'Europe/Zagreb',
  'Europe/Ljubljana',
  'Europe/Skopje',
  'Europe/Vienna',
  'Europe/Berlin',
  'Europe/London',
  'America/New_York',
  'UTC',
]

export function ProfileForm({
  fullName,
  locale,
  timezone,
}: {
  fullName: string
  locale: string
  timezone: string
}) {
  const [state, action] = useActionState(updateProfileAction, {
    ...initialFormState,
    values: { fullName, locale, timezone },
  })
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <TextField name="fullName" label="Ime i prezime" state={state} required maxLength={100} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="locale">Jezik interfejsa</Label>
          <select
            id="locale"
            name="locale"
            defaultValue={state.values?.locale ?? locale}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="sr-Latn">Srpski (latinica)</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="timezone">Vremenska zona</Label>
          <select
            id="timezone"
            name="timezone"
            defaultValue={state.values?.timezone ?? timezone}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </div>
      <SubmitButton pendingText="Čuvam…">Sačuvajte profil</SubmitButton>
    </form>
  )
}

export function WorkspaceForm({
  workspaceId,
  name,
  type,
}: {
  workspaceId: string
  name: string
  type: 'business' | 'agency'
}) {
  const [state, action] = useActionState(updateWorkspaceAction, {
    ...initialFormState,
    values: { name, type },
  })
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <FormMessage state={state} />
      <TextField name="name" label="Naziv radnog prostora" state={state} required maxLength={100} />
      <div className="space-y-1.5">
        <Label htmlFor="type">Tip</Label>
        <select
          id="type"
          name="type"
          defaultValue={state.values?.type ?? type}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="business">Jedan biznis</option>
          <option value="agency">Agencija</option>
        </select>
      </div>
      <SubmitButton pendingText="Čuvam…">Sačuvajte</SubmitButton>
    </form>
  )
}

export function CreateBrandForm({ workspaceId }: { workspaceId: string }) {
  const [state, action] = useActionState(createBrandAction, initialFormState)
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label="Naziv brenda" state={state} required maxLength={100} />
        <TextField
          name="websiteUrl"
          label="Sajt"
          state={state}
          placeholder="https://primer.rs"
          autoComplete="url"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="contentLocale">Jezik sadržaja</Label>
          <select
            id="contentLocale"
            name="contentLocale"
            defaultValue="sr-Latn"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="sr-Latn">Srpski, latinica</option>
            <option value="sr-Cyrl">Srpski, ćirilica</option>
            <option value="en">Engleski</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brand-timezone">Vremenska zona brenda</Label>
          <select
            id="brand-timezone"
            name="timezone"
            defaultValue="Europe/Belgrade"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </div>
      <SubmitButton pendingText="Dodajem…">Dodajte brend</SubmitButton>
    </form>
  )
}

/**
 * Zona postojećeg brenda (EDGE_CASES K7). Podrazumevano zakazane objave zadržavaju isto lokalno
 * vreme u novoj zoni; bez toga ostaju u istom trenutku (pa im se lokalno vreme promeni).
 */
export function BrandTimezoneForm({
  brandId,
  timezone,
  scheduledCount,
}: {
  brandId: string
  timezone: string
  scheduledCount: number
}) {
  const router = useRouter()
  const [value, setValue] = useState(timezone)
  const [keepLocal, setKeepLocal] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const options = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]

  async function save() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/brands/${brandId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ timezone: value, shiftSchedule: keepLocal }),
      })
      const data = (await res.json()) as ApiResponse<{ shifted: { targets: number; posts: number } | null }>
      if (!data.ok) throw new Error(data.error.message)
      const moved = data.data.shifted?.targets ?? 0
      setMessage({
        ok: true,
        text: moved
          ? `Zona je sačuvana; ${moved} ${pluralSr(moved, 'zakazana objava zadržava', 'zakazane objave zadržavaju', 'zakazanih objava zadržava')} isto lokalno vreme.`
          : 'Zona je sačuvana.',
      })
      router.refresh()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Čuvanje nije uspelo.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <select
        aria-label="Vremenska zona brenda"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      >
        {options.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </select>
      {value !== timezone && scheduledCount > 0 ? (
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={keepLocal} onChange={(e) => setKeepLocal(e.target.checked)} />
          zadrži lokalno vreme {scheduledCount}{' '}
          {pluralSr(scheduledCount, 'zakazane objave', 'zakazane objave', 'zakazanih objava')}
        </label>
      ) : null}
      {value !== timezone ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void save()}>
          {busy ? 'Čuvam…' : 'Sačuvaj zonu'}
        </Button>
      ) : null}
      {message ? (
        <span
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'text-emerald-700' : 'text-destructive'}
        >
          {message.text}
        </span>
      ) : null}
    </div>
  )
}
