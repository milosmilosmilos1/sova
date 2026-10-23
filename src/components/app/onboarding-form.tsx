'use client'

import { useActionState, useState } from 'react'

import { FormMessage, SubmitButton, TextField } from '@/components/forms/form-parts'
import { Label } from '@/components/ui/label'
import { createWorkspaceAction } from '@/lib/auth/actions'
import { initialFormState } from '@/lib/auth/form-state'
import { cn } from '@/lib/utils'

const TYPES = [
  { value: 'business', title: 'Jedan biznis', text: 'Vodim mreže za svoju firmu ili svoj brend.' },
  {
    value: 'agency',
    title: 'Agencija ili freelancer',
    text: 'Vodim mreže za više klijenata, svaki je poseban brend.',
  },
] as const

export function OnboardingForm({ defaultName }: { defaultName?: string }) {
  const [state, action] = useActionState(createWorkspaceAction, initialFormState)
  const [type, setType] = useState<'business' | 'agency'>(
    (state.values?.type as 'business' | 'agency') ?? 'business',
  )

  return (
    <form action={action} className="space-y-6" noValidate>
      <FormMessage state={state} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Kakav nalog pravite?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {TYPES.map((t) => (
            <label
              key={t.value}
              className={cn(
                'cursor-pointer rounded-lg border p-4 hover:bg-muted/50',
                type === t.value && 'border-primary ring-2 ring-primary/30',
              )}
            >
              <input
                type="radio"
                name="type"
                value={t.value}
                checked={type === t.value}
                onChange={() => setType(t.value)}
                className="sr-only"
              />
              <span className="block font-medium">{t.title}</span>
              <span className="block text-sm text-muted-foreground">{t.text}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <TextField
        name="name"
        label={type === 'agency' ? 'Naziv agencije' : 'Naziv firme'}
        state={state}
        required
        defaultValue={defaultName}
        maxLength={100}
      />
      {type === 'agency' ? (
        <TextField
          name="brandName"
          label="Prvi klijent (brend)"
          state={state}
          hint="Možete dodati još brendova kasnije."
          maxLength={100}
        />
      ) : (
        <input type="hidden" name="brandName" value="" />
      )}
      <div className="space-y-1.5">
        <TextField
          name="websiteUrl"
          label="Sajt brenda"
          state={state}
          placeholder="https://primer.rs"
          hint="Sova od sajta uči brend. Ako sajta nema, ostavite prazno."
          autoComplete="url"
        />
        <Label className="sr-only" htmlFor="websiteUrl">
          Sajt
        </Label>
      </div>
      <SubmitButton pendingText="Pravim radni prostor…" className="w-full sm:w-auto">
        Napravite radni prostor
      </SubmitButton>
    </form>
  )
}
