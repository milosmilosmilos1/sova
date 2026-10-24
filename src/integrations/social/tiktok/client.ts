import { ProviderError, type ProviderErrorCode } from '@/integrations/social/errors'

/**
 * Tanki klijent za TikTok API v2 (`open.tiktokapis.com`). Content API vraća `{ data, error: { code,
 * message, logid } }` gde je `code: "ok"` uspeh; OAuth endpoint vraća `{ error, error_description }`.
 */
export interface TikTokErrorBody {
  code?: string
  message?: string
  logid?: string
  log_id?: string
}

const CODE_MAP: Record<string, ProviderErrorCode> = {
  access_token_invalid: 'TOKEN_INVALID',
  invalid_grant: 'TOKEN_INVALID',
  scope_not_authorized: 'PERMISSION_LOST',
  scope_permission_missed: 'PERMISSION_LOST',
  rate_limit_exceeded: 'RATE_LIMITED',
  spam_risk_too_many_posts: 'QUOTA_EXCEEDED',
  reached_active_user_cap: 'QUOTA_EXCEEDED',
  spam_risk_user_banned_from_posting: 'ACCOUNT_RESTRICTED',
  unaudited_client_can_only_post_to_private_accounts: 'ACCOUNT_RESTRICTED',
  url_ownership_unverified: 'MEDIA_REJECTED',
  privacy_level_option_mismatch: 'CONTENT_REJECTED',
  invalid_param: 'CONTENT_REJECTED',
}

const USER_MESSAGE: Record<string, string> = {
  unaudited_client_can_only_post_to_private_accounts:
    'Sova još nije prošla TikTok proveru aplikacije: do tada objave idu samo na privatne naloge i kao „Samo ja”.',
  url_ownership_unverified:
    'TikTok ne prihvata adresu medija (domen nije verifikovan u TikTok portalu). Javite se podršci.',
  spam_risk_too_many_posts:
    'TikTok je za danas ograničio broj objava sa ovog naloga. Sova će pokušati sutra.',
  reached_active_user_cap: 'Dnevni limit TikTok aplikacije je dostignut. Sova će pokušati sutra.',
  spam_risk_user_banned_from_posting:
    'TikTok je ovom nalogu zabranio objavljivanje. Proverite obaveštenja u TikTok aplikaciji.',
  privacy_level_option_mismatch:
    'Izabrana privatnost više nije dostupna za ovaj TikTok nalog. Izaberite je ponovo u objavi.',
}

export function mapTikTokError(status: number, error: TikTokErrorBody | null): ProviderError {
  const code = error?.code ?? ''
  const message = error?.message ?? `HTTP ${status}`
  const mapped: ProviderErrorCode =
    CODE_MAP[code] ??
    (status === 401
      ? 'TOKEN_INVALID'
      : status === 429
        ? 'RATE_LIMITED'
        : status >= 500
          ? 'PROVIDER_DOWN'
          : status === 403
            ? 'PERMISSION_LOST'
            : 'UNKNOWN')
  return new ProviderError(mapped, {
    message: `TikTok ${status}${code ? ` ${code}` : ''}: ${message}`,
    userMessage: USER_MESSAGE[code],
    raw: error ?? { status },
    status,
  })
}

const BACKSLASH = 92

/**
 * TikTok ID-jevi objava su int64 (19 cifara) i u JSON-u stižu kao brojevi (npr.
 * `publicaly_available_post_id`); JSON.parse ih zaokružuje na 2^53. Brojevi od 16 i više cifara van
 * stringova se zato pre parsiranja pretvaraju u stringove.
 */
export function quoteBigInts(text: string): string {
  let out = ''
  let i = 0
  let inString = false
  while (i < text.length) {
    const ch = text.charAt(i)
    if (inString) {
      out += ch
      if (ch.charCodeAt(0) === BACKSLASH) {
        out += text.charAt(i + 1)
        i += 2
        continue
      }
      if (ch === '"') inString = false
      i++
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      i++
      continue
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let j = i + 1
      while (j < text.length && '0123456789.eE+-'.includes(text.charAt(j))) j++
      const num = text.slice(i, j)
      out += /^-?[0-9]{16,}$/.test(num) ? `"${num}"` : num
      i = j
      continue
    }
    out += ch
    i++
  }
  return out
}

export interface TikTokClientOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const API = 'https://open.tiktokapis.com'

export class TikTokClient {
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(
    private readonly accessToken: string,
    options: TikTokClientOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? 20_000
  }

  /** Vraća `data` iz odgovora; greška iz `error.code` (≠ "ok") ili HTTP statusa → ProviderError. */
  async call<T>(
    method: 'GET' | 'POST',
    path: string,
    init: { query?: string; json?: unknown } = {},
  ): Promise<T> {
    let res: Response
    try {
      res = await this.fetchImpl(`${API}${path}${init.query ? `?${init.query}` : ''}`, {
        method,
        headers: {
          authorization: `Bearer ${this.accessToken}`,
          ...(init.json !== undefined ? { 'content-type': 'application/json; charset=UTF-8' } : {}),
        },
        body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      throw new ProviderError('PROVIDER_DOWN', {
        message: 'TikTok API nije dostupan.',
        raw: error,
        retryable: true,
      })
    }
    type Body = { data?: T; error?: TikTokErrorBody }
    const text = await res.text()
    let body: Body | null = null
    try {
      body = text ? (JSON.parse(quoteBigInts(text)) as Body) : null
    } catch {
      body = null
    }
    const err = body?.error
    if (!res.ok || (err?.code && err.code !== 'ok')) throw mapTikTokError(res.status, err ?? null)
    return (body?.data ?? {}) as T
  }
}

export interface ChunkPlan {
  chunkSize: number
  totalChunks: number
  ranges: Array<{ start: number; end: number }>
}

const MB = 1024 * 1024

/**
 * Podela videa za FILE_UPLOAD (Media Transfer Guide): do 64 MB jedan deo cele veličine; veće u
 * delovima od 32 MB gde poslednji upija ostatak (dozvoljeno do 128 MB), najviše 1000 delova.
 */
export function planChunks(size: number): ChunkPlan {
  if (size <= 0) throw new Error('Prazan fajl.')
  if (size <= 64 * MB) return { chunkSize: size, totalChunks: 1, ranges: [{ start: 0, end: size - 1 }] }
  const chunkSize = 32 * MB
  const totalChunks = Math.floor(size / chunkSize)
  if (totalChunks > 1000) throw new Error('Video je prevelik za TikTok.')
  const ranges = Array.from({ length: totalChunks }, (_, i) => ({
    start: i * chunkSize,
    end: i === totalChunks - 1 ? size - 1 : (i + 1) * chunkSize - 1,
  }))
  return { chunkSize, totalChunks, ranges }
}
