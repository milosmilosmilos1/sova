import { z } from 'zod'

/** Zajednički oblik rezultata Server Action-a za forme (useActionState). */
export interface FormState {
  ok: boolean
  message?: string
  fields?: Record<string, string[]>
  /** vraćene vrednosti da forma ne izgubi unos */
  values?: Record<string, string>
  /** opcioni signal UI-ju (npr. 'check_email') */
  code?: string
}

export const initialFormState: FormState = { ok: false }

export function formValues(formData: FormData, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of keys) {
    const v = formData.get(k)
    if (typeof v === 'string') out[k] = v
  }
  return out
}

export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): { success: true; data: z.output<T> } | { success: false; state: FormState } {
  const raw: Record<string, unknown> = {}
  for (const [k, v] of formData.entries()) {
    if (k.startsWith('$')) continue
    if (typeof v === 'string') raw[k] = v
  }
  const parsed = schema.safeParse(raw)
  if (parsed.success) return { success: true, data: parsed.data }
  const flat = z.flattenError(parsed.error)
  const fields: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(flat.fieldErrors)) if (v) fields[k] = v as string[]
  const values: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string' && !/password/i.test(k)) values[k] = v
  return {
    success: false,
    state: { ok: false, fields, values, message: flat.formErrors[0] ?? 'Proverite označena polja.' },
  }
}
