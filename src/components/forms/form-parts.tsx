'use client'

import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { FormState } from '@/lib/auth/form-state'
import { cn } from '@/lib/utils'

export function SubmitButton({
  children,
  pendingText,
  className,
  variant,
  size,
}: {
  children: ReactNode
  pendingText: string
  className?: string
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'xs'
}) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={className}
      variant={variant}
      size={size}
    >
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {pendingText}
        </>
      ) : (
        children
      )}
    </Button>
  )
}

export function FieldErrors({ errors, id }: { errors?: string[]; id?: string }) {
  if (!errors?.length) return null
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {errors[0]}
    </p>
  )
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null
  return (
    <div
      role={state.ok ? 'status' : 'alert'}
      className={cn(
        'rounded-md border px-3 py-2 text-sm break-words',
        state.ok
          ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100'
          : 'border-destructive/40 bg-destructive/10 text-destructive',
      )}
    >
      {state.message}
    </div>
  )
}

export function TextField({
  name,
  label,
  type = 'text',
  state,
  required,
  autoComplete,
  placeholder,
  defaultValue,
  hint,
  minLength,
  maxLength,
}: {
  name: string
  label: string
  type?: string
  state: FormState
  required?: boolean
  autoComplete?: string
  placeholder?: string
  defaultValue?: string
  hint?: string
  minLength?: number
  maxLength?: number
}) {
  const errors = state.fields?.[name]
  const errorId = `${name}-error`
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        defaultValue={state.values?.[name] ?? defaultValue}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={errors?.length ? errorId : undefined}
        minLength={minLength}
        maxLength={maxLength}
      />
      {hint && !errors?.length ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <FieldErrors errors={errors} id={errorId} />
    </div>
  )
}
