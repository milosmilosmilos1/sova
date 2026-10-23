import 'server-only'

import * as Sentry from '@sentry/nextjs'
import { type NextRequest } from 'next/server'
import { z } from 'zod'

import { getViewerFromRequest, type Viewer } from '@/lib/auth/viewer'
import { env } from '@/lib/env'
import { createLogger, type Logger } from '@/lib/logger'
import { rateLimit } from '@/lib/ratelimit'

import { ApiError, isApiError } from './errors'
import { jsonFail, jsonOk } from './response'

/**
 * Jedan wrapper za sve API rute. Redosled (brif 14.1):
 *  1 auth → 401, 2 pristup/uloga → 403 (u ruti kroz ctx.viewer), 3 Zod → 400,
 *  4 rate limit → 429, 5 idempotentnost (dodaje se u fazi 5), zatim telo rute.
 */
export type AuthMode =
  | 'none' // javne rute
  | 'cron' // Bearer CRON_SECRET
  | 'user' // prijavljen korisnik
  | 'verified' // prijavljen i potvrđen email
  | 'admin' // platform_admin sa MFA

export interface RateLimitSpec {
  /** naziv limita, deo Redis ključa */
  name: string
  limit: number
  windowSec: number
  /** po čemu se broji; 'user' pada na IP kad nema korisnika */
  by?: 'ip' | 'user'
}

export interface HandlerOptions<TBody, TQuery, TParams> {
  auth: AuthMode
  body?: z.ZodType<TBody>
  query?: z.ZodType<TQuery>
  params?: z.ZodType<TParams>
  rateLimit?: RateLimitSpec
  /** gornja granica tela u bajtovima (podrazumevano 1 MB) */
  maxBodyBytes?: number
}

export interface HandlerContext<TBody, TQuery, TParams> {
  req: NextRequest
  requestId: string
  log: Logger
  ip: string
  body: TBody
  query: TQuery
  params: TParams
  /** null samo kad je auth: 'none' ili 'cron' */
  viewer: Viewer | null
}

type RouteContext = { params: Promise<Record<string, string | string[]>> }
type RouteHandler = (req: NextRequest, ctx: RouteContext) => Promise<Response>

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Za rute sa auth: 'user' | 'verified' | 'admin' viewer je uvek prisutan. */
export function assertViewer(viewer: Viewer | null): Viewer {
  if (!viewer) throw new ApiError('UNAUTHENTICATED')
  return viewer
}

export function getRequestId(req: NextRequest): string {
  return req.headers.get('x-request-id') ?? crypto.randomUUID()
}

export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return req.headers.get('x-real-ip') ?? '127.0.0.1'
}

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true // ne-browser klijenti; zaštita je u auth sloju
  try {
    return new URL(origin).origin === new URL(env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin).origin
  } catch {
    return false
  }
}

function zodFields(error: z.ZodError): Record<string, string[]> {
  const flat = z.flattenError(error)
  const fields: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(flat.fieldErrors)) if (v) fields[k] = v as string[]
  if (flat.formErrors.length) fields._form = flat.formErrors
  return fields
}

async function parseBody<T>(req: NextRequest, schema: z.ZodType<T>, maxBytes: number): Promise<T> {
  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > maxBytes) throw new ApiError('PAYLOAD_TOO_LARGE')
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new ApiError('VALIDATION', 'Telo zahteva mora biti ispravan JSON.')
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) throw new ApiError('VALIDATION', undefined, { fields: zodFields(parsed.error) })
  return parsed.data
}

function parseQuery<T>(req: NextRequest, schema: z.ZodType<T>): T {
  const obj: Record<string, string | string[]> = {}
  for (const [k, v] of req.nextUrl.searchParams.entries()) {
    const existing = obj[k]
    if (existing === undefined) obj[k] = v
    else obj[k] = Array.isArray(existing) ? [...existing, v] : [existing, v]
  }
  const parsed = schema.safeParse(obj)
  if (!parsed.success) throw new ApiError('VALIDATION', undefined, { fields: zodFields(parsed.error) })
  return parsed.data
}

async function authenticate(mode: AuthMode, req: NextRequest): Promise<Viewer | null> {
  if (mode === 'none') return null
  if (mode === 'cron') {
    const header = req.headers.get('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!env.CRON_SECRET || token !== env.CRON_SECRET) throw new ApiError('UNAUTHENTICATED')
    return null
  }
  const viewer = await getViewerFromRequest(req)
  if (!viewer) throw new ApiError('UNAUTHENTICATED')
  if (viewer.profile.isBanned) throw new ApiError('FORBIDDEN', 'Nalog je blokiran.')
  if ((mode === 'verified' || mode === 'admin') && !viewer.profile.emailVerifiedAt) {
    throw new ApiError('EMAIL_NOT_VERIFIED')
  }
  if (mode === 'admin') {
    if (viewer.profile.platformRole !== 'platform_admin') throw new ApiError('FORBIDDEN')
    if (!viewer.mfaVerified)
      throw new ApiError('FORBIDDEN', 'Admin pristup traži uključenu dvofaktorsku zaštitu.')
  }
  return viewer
}

export function createHandler<TBody = undefined, TQuery = undefined, TParams = undefined>(
  options: HandlerOptions<TBody, TQuery, TParams>,
  fn: (ctx: HandlerContext<TBody, TQuery, TParams>) => Promise<Response | unknown>,
): RouteHandler {
  return async (req, routeCtx) => {
    const requestId = getRequestId(req)
    const ip = getClientIp(req)
    const log = createLogger({ requestId, method: req.method, path: req.nextUrl.pathname })

    try {
      if (
        MUTATING.has(req.method) &&
        (options.auth === 'user' || options.auth === 'verified' || options.auth === 'admin')
      ) {
        if (!sameOrigin(req)) throw new ApiError('FORBIDDEN', 'Zahtev ne dolazi sa dozvoljenog porekla.')
      }

      const viewer = await authenticate(options.auth, req)

      let finalParams = undefined as TParams
      if (options.params) {
        const rawParams = await routeCtx.params
        const parsed = options.params.safeParse(rawParams)
        if (!parsed.success) throw new ApiError('VALIDATION', undefined, { fields: zodFields(parsed.error) })
        finalParams = parsed.data
      }

      const query = options.query ? parseQuery(req, options.query) : (undefined as TQuery)
      const body =
        options.body && MUTATING.has(req.method)
          ? await parseBody(req, options.body, options.maxBodyBytes ?? 1024 * 1024)
          : (undefined as TBody)

      if (options.rateLimit) {
        const spec = options.rateLimit
        const subject = spec.by === 'user' && viewer ? `u:${viewer.user.id}` : `ip:${ip}`
        const result = await rateLimit(`${spec.name}:${subject}`, {
          limit: spec.limit,
          windowSec: spec.windowSec,
        })
        if (!result.success) {
          const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))
          throw new ApiError('RATE_LIMITED', undefined, { retryAfterSec })
        }
      }

      const result = await fn({ req, requestId, log, ip, body, query, params: finalParams, viewer })
      if (result instanceof Response) {
        if (!result.headers.has('x-request-id')) result.headers.set('x-request-id', requestId)
        return result
      }
      return jsonOk(result, requestId)
    } catch (error) {
      if (isApiError(error)) {
        if (error.status >= 500) log.error('api_error', { code: error.code, error })
        else log.info('api_rejected', { code: error.code, status: error.status })
        return jsonFail(error, requestId)
      }
      if (error instanceof z.ZodError) {
        return jsonFail(new ApiError('VALIDATION', undefined, { fields: zodFields(error) }), requestId)
      }
      log.error('unhandled_error', { error })
      Sentry.captureException(error, { tags: { requestId } })
      return jsonFail(new ApiError('INTERNAL', undefined, { cause: error }), requestId)
    }
  }
}
