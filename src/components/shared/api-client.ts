import type { ApiResponse } from '@/lib/api/response'

/**
 * Odgovor koji nije od Sovinog API-ja (D-126): Netlify posle 30 sekundi vraća 502 sa svojim telom.
 * Poruke nema, pa `ErrorBox` prikazuje poruku na jeziku interfejsa.
 */
export class HttpError extends Error {
  constructor(readonly status: number) {
    super('')
    this.name = 'HttpError'
  }
}

/** Poziv API-ja iz klijentske komponente: JSON telo i greška kao Error sa porukom servera. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.json !== undefined) headers.set('content-type', 'application/json')
  const res = await fetch(path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })
  const data = (await res.json().catch(() => null)) as Partial<ApiResponse<T>> | null
  if (data?.ok === true) return data.data as T
  if (data?.ok === false && data.error?.message) throw new Error(data.error.message)
  throw new HttpError(res.status)
}

export interface BulkResult {
  done: string[]
  failed: Array<{ id: string; message: string }>
}

/** Najviše stavki u jednom zahtevu, isto kao ograničenje u šemi (`postsBulkSchema`). */
const BULK_MAX = 100

/**
 * Radnja nad više stavki na serveru (D-126): server radi koliko stigne za 20 sekundi, a ostatak vraća
 * u `rest`; ova funkcija ga šalje u sledećem zahtevu dok sve ne bude urađeno.
 */
export async function bulkRequest(
  path: string,
  body: Record<string, unknown>,
  ids: readonly string[],
): Promise<BulkResult> {
  const out: BulkResult = { done: [], failed: [] }
  let left = [...ids]
  while (left.length) {
    const batch = left.slice(0, BULK_MAX)
    const r = await api<BulkResult & { rest?: string[] }>(path, {
      method: 'POST',
      json: { ...body, ids: batch },
    })
    out.done.push(...r.done)
    out.failed.push(...r.failed)
    const rest = r.rest ?? []
    // server uvek počne bar prve stavke; bez napretka petlja ne sme da se vrti
    if (rest.length >= batch.length) break
    left = [...rest, ...left.slice(BULK_MAX)]
  }
  return out
}
