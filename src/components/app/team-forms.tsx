'use client'

import { useTranslations } from 'next-intl'
import { useActionState } from 'react'

import { FormMessage, SubmitButton, TextField } from '@/components/forms/form-parts'
import { Label } from '@/components/ui/label'
import { inviteMemberAction } from '@/lib/auth/actions'
import { initialFormState } from '@/lib/auth/form-state'

const ROLES = ['editor', 'approver', 'viewer', 'admin'] as const

export function InviteForm({
  workspaceId,
  brands,
}: {
  workspaceId: string
  brands: Array<{ id: string; name: string }>
}) {
  const t = useTranslations('team.invite')
  const [state, action] = useActionState(inviteMemberAction, initialFormState)
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <FormMessage state={state} />
      <TextField name="email" label={t('email')} type="email" state={state} required autoComplete="off" />
      <div className="space-y-1.5">
        <Label htmlFor="role">{t('role')}</Label>
        <select
          id="role"
          name="role"
          defaultValue={state.values?.role ?? 'editor'}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {t(`roleOptions.${role}`)}
            </option>
          ))}
        </select>
      </div>
      {brands.length > 1 ? (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">{t('brandAccess')}</legend>
          <p className="text-xs text-muted-foreground">{t('brandAccessHint')}</p>
          <div className="flex flex-wrap gap-3">
            {brands.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="brandIds" value={b.id} className="size-4" />
                {b.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <SubmitButton pendingText={t('pending')}>{t('submit')}</SubmitButton>
    </form>
  )
}
