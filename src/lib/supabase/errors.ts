import type { PostgrestError } from '@supabase/supabase-js'

import { ApiError, type ApiErrorCode } from '@/lib/api/errors'

/**
 * Greške iz RPC funkcija i trigera (raise exception 'KOD' using detail = ...)
 * mapiraju se u ApiError sa porukom na srpskom.
 */
const RPC_CODES: Array<[string, ApiErrorCode, string]> = [
  ['INSUFFICIENT_TOKENS', 'INSUFFICIENT_TOKENS', 'Nemate dovoljno tokena za ovu radnju.'],
  ['PLAN_LIMIT', 'PLAN_LIMIT', 'Dostigli ste limit vašeg plana.'],
  ['CONFLICT', 'CONFLICT', 'Podatak je u međuvremenu promenjen. Osvežite stranicu pa pokušajte ponovo.'],
  ['INVALID_TRANSITION', 'CONFLICT', 'Ova promena statusa nije dozvoljena iz trenutnog stanja.'],
  ['POST_LOCKED', 'POST_LOCKED', 'Objava se trenutno objavljuje i ne može da se menja.'],
  ['LAST_OWNER', 'CONFLICT', 'Radni prostor mora imati bar jednog vlasnika. Prvo prenesite vlasništvo.'],
  ['INVITATION_EXPIRED', 'NOT_FOUND', 'Pozivnica je istekla. Zatražite novu.'],
  ['UNAUTHENTICATED', 'UNAUTHENTICATED', 'Niste prijavljeni.'],
  ['FORBIDDEN', 'FORBIDDEN', 'Nemate dozvolu za ovu radnju.'],
  ['NOT_FOUND', 'NOT_FOUND', 'Traženi podatak ne postoji ili nemate pristup.'],
  ['VALIDATION', 'VALIDATION', 'Podaci nisu ispravni.'],
  ['APPEND_ONLY', 'FORBIDDEN', 'Ovaj zapis se ne može menjati.'],
  ['AUTOPILOT_LEVEL3_CONFIRMATION_REQUIRED', 'VALIDATION', 'Pun autopilot traži izričitu potvrdu.'],
  ['MEDIA_IN_USE', 'CONFLICT', 'Medij je u zakazanoj objavi i ne može da se obriše.'],
  ['REASON_REQUIRED', 'VALIDATION', 'Razlog je obavezan.'],
]

export function mapDbError(error: PostgrestError | Error | null | undefined, fallback?: string): ApiError {
  if (!error) return new ApiError('INTERNAL', fallback)
  const message = error.message ?? ''
  for (const [needle, code, text] of RPC_CODES) {
    if (message.includes(needle)) {
      const details = 'details' in error && error.details ? { detail: error.details } : undefined
      return new ApiError(code, text, { details, cause: error })
    }
  }
  const pgCode = 'code' in error ? (error as PostgrestError).code : undefined
  if (pgCode === '23505') return new ApiError('CONFLICT', 'Takav zapis već postoji.', { cause: error })
  if (pgCode === '23503')
    return new ApiError('CONFLICT', 'Zapis je povezan sa drugim podacima.', { cause: error })
  if (pgCode === '42501') return new ApiError('FORBIDDEN', undefined, { cause: error })
  if (pgCode === '22P02') return new ApiError('VALIDATION', 'Neispravan format podatka.', { cause: error })
  if (pgCode === 'PGRST116') return new ApiError('NOT_FOUND', undefined, { cause: error })
  return new ApiError('INTERNAL', fallback, { cause: error })
}

/** Baca ApiError ako je Supabase odgovor sa greškom; inače vraća data. */
export function unwrap<T>(
  result: { data: T; error: PostgrestError | null },
  fallback?: string,
): NonNullable<T> {
  if (result.error) throw mapDbError(result.error, fallback)
  if (result.data === null || result.data === undefined) throw new ApiError('NOT_FOUND', fallback)
  return result.data as NonNullable<T>
}
