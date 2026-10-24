import { ApiError } from '@/lib/api/errors'

/** Greške mreža svedene na zajedničke kodove (docs/INTEGRATIONS.md 1). */
export type ProviderErrorCode =
  | 'TOKEN_INVALID'
  | 'PERMISSION_LOST'
  | 'RATE_LIMITED'
  | 'MEDIA_REJECTED'
  | 'CONTENT_REJECTED'
  | 'DUPLICATE'
  | 'QUOTA_EXCEEDED'
  | 'ACCOUNT_RESTRICTED'
  | 'PROVIDER_DOWN'
  | 'NOT_SUPPORTED'
  | 'UNKNOWN'

const USER_MESSAGE: Record<ProviderErrorCode, string> = {
  TOKEN_INVALID: 'Veza sa mrežom je istekla ili je opozvana. Povežite nalog ponovo.',
  PERMISSION_LOST:
    'Nemate više potrebne dozvole na ovom nalogu. Proverite uloge na mreži pa povežite ponovo.',
  RATE_LIMITED: 'Mreža privremeno ograničava zahteve. Sova će pokušati ponovo.',
  MEDIA_REJECTED: 'Mreža je odbila medij (format, veličina ili odnos stranica).',
  CONTENT_REJECTED: 'Mreža je odbila sadržaj objave.',
  DUPLICATE: 'Mreža je prepoznala identičnu objavu.',
  QUOTA_EXCEEDED: 'Dnevni limit objava na ovoj mreži je potrošen.',
  ACCOUNT_RESTRICTED: 'Nalog na mreži je ograničen. Proverite obaveštenja na mreži.',
  PROVIDER_DOWN: 'Mreža trenutno ne odgovara. Sova će pokušati ponovo.',
  NOT_SUPPORTED: 'Ova mreža još nije podržana.',
  UNKNOWN: 'Mreža je vratila neočekivanu grešku.',
}

export class ProviderError extends Error {
  readonly code: ProviderErrorCode
  readonly retryable: boolean
  readonly userMessage: string
  readonly raw: unknown
  readonly status: number | null

  constructor(
    code: ProviderErrorCode,
    options: {
      message?: string
      userMessage?: string
      retryable?: boolean
      raw?: unknown
      status?: number | null
    } = {},
  ) {
    super(options.message ?? USER_MESSAGE[code])
    this.name = 'ProviderError'
    this.code = code
    this.retryable = options.retryable ?? (code === 'RATE_LIMITED' || code === 'PROVIDER_DOWN')
    this.userMessage = options.userMessage ?? USER_MESSAGE[code]
    this.raw = options.raw
    this.status = options.status ?? null
  }
}

export function isProviderError(e: unknown): e is ProviderError {
  return e instanceof ProviderError
}

/** Za API rute: greška mreže kao odgovor korisniku. */
export function providerToApiError(e: unknown): ApiError {
  if (isProviderError(e)) {
    const code =
      e.code === 'TOKEN_INVALID' || e.code === 'PERMISSION_LOST'
        ? 'FORBIDDEN'
        : e.code === 'RATE_LIMITED' || e.code === 'QUOTA_EXCEEDED'
          ? 'RATE_LIMITED'
          : e.code === 'MEDIA_REJECTED' || e.code === 'CONTENT_REJECTED' || e.code === 'NOT_SUPPORTED'
            ? 'VALIDATION'
            : 'PROVIDER_ERROR'
    return new ApiError(code, e.userMessage, { cause: e, details: { providerCode: e.code } })
  }
  if (e instanceof ApiError) return e
  return new ApiError('PROVIDER_ERROR', undefined, { cause: e })
}
