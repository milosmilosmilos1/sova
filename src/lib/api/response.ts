import { NextResponse } from 'next/server'

import type { AppLocale } from '@/i18n/config'
import { translateFields, translateServerText } from '@/i18n/server-text'

import type { ApiError, ApiErrorCode } from './errors'

export type ApiOk<T> = { ok: true; data: T }
export type ApiFail = {
  ok: false
  error: {
    code: ApiErrorCode
    message: string
    fields?: Record<string, string[]>
    details?: Record<string, unknown>
    requestId: string
  }
}
export type ApiResponse<T> = ApiOk<T> | ApiFail

function baseHeaders(requestId: string): HeadersInit {
  return { 'x-request-id': requestId, 'cache-control': 'no-store' }
}

export function jsonOk<T>(data: T, requestId: string, init: { status?: number; headers?: HeadersInit } = {}) {
  const body: ApiOk<T> = { ok: true, data }
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: { ...baseHeaders(requestId), ...(init.headers ?? {}) },
  })
}

/** Greška API-ja; poruka i poruke polja idu na jeziku korisnika (D-130). */
export function jsonFail(error: ApiError, requestId: string, locale: AppLocale = 'sr-Latn') {
  const fields = translateFields(error.fields, locale)
  const body: ApiFail = {
    ok: false,
    error: {
      code: error.code,
      message: translateServerText(error.message, locale),
      ...(fields ? { fields } : {}),
      ...(error.details ? { details: error.details } : {}),
      requestId,
    },
  }
  const headers: Record<string, string> = { ...(baseHeaders(requestId) as Record<string, string>) }
  if (error.retryAfterSec) headers['retry-after'] = String(error.retryAfterSec)
  return NextResponse.json(body, { status: error.status, headers })
}
