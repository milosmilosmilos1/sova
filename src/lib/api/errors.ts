export const API_ERROR_CODES = [
  'UNAUTHENTICATED',
  'EMAIL_NOT_VERIFIED',
  'FORBIDDEN',
  'VALIDATION',
  'RATE_LIMITED',
  'INSUFFICIENT_TOKENS',
  'AI_UNAVAILABLE',
  'AI_BLOCKED',
  'PROVIDER_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'PLAN_LIMIT',
  'POST_LOCKED',
  'MAINTENANCE',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

const STATUS: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  EMAIL_NOT_VERIFIED: 403,
  FORBIDDEN: 403,
  VALIDATION: 400,
  RATE_LIMITED: 429,
  INSUFFICIENT_TOKENS: 402,
  AI_UNAVAILABLE: 503,
  AI_BLOCKED: 422,
  PROVIDER_ERROR: 502,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PLAN_LIMIT: 403,
  POST_LOCKED: 409,
  MAINTENANCE: 503,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL: 500,
}

/** Podrazumevane poruke na srpskom, razumljive korisniku. */
const DEFAULT_MESSAGE: Record<ApiErrorCode, string> = {
  UNAUTHENTICATED: 'Niste prijavljeni. Prijavite se pa pokušajte ponovo.',
  EMAIL_NOT_VERIFIED: 'Potvrdite email adresu pre nego što nastavite.',
  FORBIDDEN: 'Nemate dozvolu za ovu radnju.',
  VALIDATION: 'Podaci nisu ispravni. Proverite označena polja.',
  RATE_LIMITED: 'Previše zahteva u kratkom roku. Sačekajte malo pa pokušajte ponovo.',
  INSUFFICIENT_TOKENS: 'Nemate dovoljno tokena za ovu radnju. Dopunite tokene pa pokušajte ponovo.',
  AI_UNAVAILABLE: 'AI servis trenutno nije dostupan. Pokušajte ponovo za nekoliko minuta.',
  AI_BLOCKED: 'Sadržaj nije prošao bezbednosnu proveru. Promenite opis pa pokušajte ponovo.',
  PROVIDER_ERROR: 'Spoljni servis je vratio grešku. Pokušajte ponovo.',
  NOT_FOUND: 'Traženi podatak ne postoji ili nemate pristup.',
  CONFLICT: 'Podatak je u međuvremenu promenjen. Osvežite stranicu pa pokušajte ponovo.',
  PLAN_LIMIT: 'Dostigli ste limit vašeg plana. Nadogradite plan da biste nastavili.',
  POST_LOCKED: 'Objava se trenutno objavljuje i ne može da se menja.',
  MAINTENANCE: 'Sova je na kratkom održavanju. Pokušajte ponovo za nekoliko minuta.',
  PAYLOAD_TOO_LARGE: 'Zahtev je prevelik.',
  INTERNAL: 'Došlo je do greške na našoj strani. Pokušajte ponovo, a ako se ponavlja javite podršci.',
}

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly fields?: Record<string, string[]>
  readonly details?: Record<string, unknown>
  readonly retryAfterSec?: number

  constructor(
    code: ApiErrorCode,
    message?: string,
    options: {
      fields?: Record<string, string[]>
      details?: Record<string, unknown>
      retryAfterSec?: number
      cause?: unknown
    } = {},
  ) {
    super(message ?? DEFAULT_MESSAGE[code], { cause: options.cause })
    this.name = 'ApiError'
    this.code = code
    this.status = STATUS[code]
    this.fields = options.fields
    this.details = options.details
    this.retryAfterSec = options.retryAfterSec
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function defaultMessage(code: ApiErrorCode): string {
  return DEFAULT_MESSAGE[code]
}
