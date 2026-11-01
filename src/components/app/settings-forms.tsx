'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'

import { FormMessage, SubmitButton, TextField } from '@/components/forms/form-parts'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { ApiResponse } from '@/lib/api/response'
import { createBrandAction, updateProfileAction, updateWorkspaceAction } from '@/lib/auth/actions'
import { initialFormState } from '@/lib/auth/form-state'

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
  const t = useTranslations('settings')
  const tl = useTranslations('locale')
  const [state, action] = useActionState(updateProfileAction, {
    ...initialFormState,
    values: { fullName, locale, timezone },
  })
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <TextField name="fullName" label={t('profile.fullName')} state={state} required maxLength={100} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="locale">{tl('label')}</Label>
          <select
            id="locale"
            name="locale"
            defaultValue={state.values?.locale ?? locale}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {/* nazivi jezika se pišu na svom jeziku, isti su u svakom interfejsu */}
            <option value="sr-Latn">Srpski (latinica)</option>
            <option value="en">English</option>
            <option value="uk">Українська</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="timezone">{t('profile.timezone')}</Label>
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
      <SubmitButton pendingText={t('profile.saving')}>{t('profile.save')}</SubmitButton>
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
  const t = useTranslations('settings')
  const [state, action] = useActionState(updateWorkspaceAction, {
    ...initialFormState,
    values: { name, type },
  })
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <FormMessage state={state} />
      <TextField name="name" label={t('workspace.name')} state={state} required maxLength={100} />
      <div className="space-y-1.5">
        <Label htmlFor="type">{t('workspace.type')}</Label>
        <select
          id="type"
          name="type"
          defaultValue={state.values?.type ?? type}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="business">{t('workspace.typeBusiness')}</option>
          <option value="agency">{t('workspace.typeAgency')}</option>
        </select>
      </div>
      <SubmitButton pendingText={t('workspace.saving')}>{t('workspace.save')}</SubmitButton>
    </form>
  )
}

export function CreateBrandForm({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('settings')
  const tc = useTranslations('contentLocale')
  const [state, action] = useActionState(createBrandAction, initialFormState)
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label={t('brands.name')} state={state} required maxLength={100} />
        <TextField
          name="websiteUrl"
          label={t('brands.website')}
          state={state}
          placeholder={t('brands.websitePlaceholder')}
          autoComplete="url"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="contentLocale">{t('brands.contentLocale')}</Label>
          <select
            id="contentLocale"
            name="contentLocale"
            defaultValue="sr-Latn"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="sr-Latn">{tc('sr-Latn')}</option>
            <option value="sr-Cyrl">{tc('sr-Cyrl')}</option>
            <option value="en">{tc('en')}</option>
            <option value="uk">{tc('uk')}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brand-timezone">{t('brands.timezone')}</Label>
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
      <SubmitButton pendingText={t('brands.adding')}>{t('brands.add')}</SubmitButton>
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
  const t = useTranslations('settings')
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
        text: moved ? t('brandTimezone.savedShifted', { count: moved }) : t('brandTimezone.saved'),
      })
      router.refresh()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : t('brandTimezone.failed') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <select
        aria-label={t('brands.timezone')}
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
          {t('brandTimezone.keepLocal', { count: scheduledCount })}
        </label>
      ) : null}
      {value !== timezone ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void save()}>
          {busy ? t('brandTimezone.saving') : t('brandTimezone.save')}
        </Button>
      ) : null}
      {message ? (
        <span
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'text-success' : 'text-destructive'}
        >
          {message.text}
        </span>
      ) : null}
    </div>
  )
}
