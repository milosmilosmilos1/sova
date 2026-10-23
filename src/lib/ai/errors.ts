import { ApiError } from '@/lib/api/errors'

export type AiErrorCode =
  | 'NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'SAFETY_BLOCKED'
  | 'INVALID_RESPONSE'
  | 'MODEL_NOT_FOUND'
  | 'PROVIDER_ERROR'
  | 'CIRCUIT_OPEN'
  | 'BAD_REQUEST'

export class AiError extends Error {
  readonly code: AiErrorCode
  readonly retryable: boolean
  readonly status?: number
  readonly model?: string

  constructor(
    code: AiErrorCode,
    message: string,
    options: { retryable?: boolean; status?: number; model?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'AiError'
    this.code = code
    this.retryable = options.retryable ?? false
    this.status = options.status
    this.model = options.model
  }
}

export function isAiError(error: unknown): error is AiError {
  return error instanceof AiError
}

interface SdkErrorLike {
  status?: number
  message?: string
  name?: string
}

/** Greška SDK-a ili fetch-a → AiError sa klasifikacijom privremeno/trajno (brif 6.4). */
export function classifyProviderError(error: unknown, model?: string): AiError {
  if (isAiError(error)) return error
  const e = (error ?? {}) as SdkErrorLike
  const message = e.message ?? String(error)
  const status = typeof e.status === 'number' ? e.status : undefined
  const lower = message.toLowerCase()

  if (
    e.name === 'AbortError' ||
    e.name === 'TimeoutError' ||
    lower.includes('timeout') ||
    lower.includes('timed out')
  ) {
    return new AiError('TIMEOUT', 'Model nije odgovorio na vreme.', {
      retryable: true,
      status,
      model,
      cause: error,
    })
  }
  if (status === 429 || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return new AiError('RATE_LIMITED', 'Provajder ograničava broj zahteva.', {
      retryable: true,
      status,
      model,
      cause: error,
    })
  }
  if (status === 404 || lower.includes('not found') || lower.includes('is not supported')) {
    return new AiError('MODEL_NOT_FOUND', `Model ${model ?? ''} nije dostupan.`, {
      retryable: false,
      status,
      model,
      cause: error,
    })
  }
  if (status !== undefined && status >= 500) {
    return new AiError('PROVIDER_ERROR', 'Provajder je vratio grešku servera.', {
      retryable: true,
      status,
      model,
      cause: error,
    })
  }
  if (status === 400 || status === 401 || status === 403) {
    return new AiError('BAD_REQUEST', 'Zahtev ka modelu nije prihvaćen.', {
      retryable: false,
      status,
      model,
      cause: error,
    })
  }
  if (lower.includes('fetch failed') || lower.includes('econnreset') || lower.includes('network')) {
    return new AiError('PROVIDER_ERROR', 'Mrežna greška ka provajderu.', {
      retryable: true,
      status,
      model,
      cause: error,
    })
  }
  return new AiError('PROVIDER_ERROR', message || 'Nepoznata greška provajdera.', {
    retryable: false,
    status,
    model,
    cause: error,
  })
}

/** AiError → ApiError sa porukom na srpskom za korisnika. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  const ai = classifyProviderError(error)
  switch (ai.code) {
    case 'SAFETY_BLOCKED':
      return new ApiError('AI_BLOCKED', undefined, { cause: ai, details: { reason: ai.message } })
    case 'NOT_CONFIGURED':
      return new ApiError('AI_UNAVAILABLE', 'AI servis nije podešen (nedostaje ključ).', { cause: ai })
    case 'INVALID_RESPONSE':
      return new ApiError('AI_UNAVAILABLE', 'Model je vratio neupotrebljiv odgovor. Pokušajte ponovo.', {
        cause: ai,
      })
    case 'BAD_REQUEST':
      return new ApiError(
        'AI_UNAVAILABLE',
        'Zahtev ka AI modelu nije prihvaćen. Proverite unos pa pokušajte ponovo.',
        {
          cause: ai,
        },
      )
    default:
      return new ApiError('AI_UNAVAILABLE', undefined, { cause: ai, retryAfterSec: 30 })
  }
}
