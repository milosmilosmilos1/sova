'use client'

import { useActionState } from 'react'

import { FormMessage, SubmitButton, TextField } from '@/components/forms/form-parts'
import { Label } from '@/components/ui/label'
import { inviteMemberAction } from '@/lib/auth/actions'
import { initialFormState } from '@/lib/auth/form-state'

const ROLES = [
  { value: 'editor', label: 'Urednik: kreira, menja i zakazuje sadržaj' },
  { value: 'approver', label: 'Odobravalac (klijent): odobrava i komentariše' },
  { value: 'viewer', label: 'Posmatrač: samo pregled i izveštaji' },
  { value: 'admin', label: 'Administrator: sve osim naplate' },
] as const

export function InviteForm({
  workspaceId,
  brands,
}: {
  workspaceId: string
  brands: Array<{ id: string; name: string }>
}) {
  const [state, action] = useActionState(inviteMemberAction, initialFormState)
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <FormMessage state={state} />
      <TextField name="email" label="Email osobe" type="email" state={state} required autoComplete="off" />
      <div className="space-y-1.5">
        <Label htmlFor="role">Uloga</Label>
        <select
          id="role"
          name="role"
          defaultValue={state.values?.role ?? 'editor'}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      {brands.length > 1 ? (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Pristup brendovima</legend>
          <p className="text-xs text-muted-foreground">Ništa izabrano = svi brendovi.</p>
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
      <SubmitButton pendingText="Šaljem pozivnicu…">Pošaljite pozivnicu</SubmitButton>
    </form>
  )
}
