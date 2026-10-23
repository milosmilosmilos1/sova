'use client'

import { useActionState } from 'react'

import { FormMessage, SubmitButton, TextField } from '@/components/forms/form-parts'
import { Label } from '@/components/ui/label'
import { createBrandAction, updateProfileAction, updateWorkspaceAction } from '@/lib/auth/actions'
import { initialFormState } from '@/lib/auth/form-state'

const TIMEZONES = [
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
