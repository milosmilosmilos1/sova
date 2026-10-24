import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'

export const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

export interface TestUser {
  id: string
  email: string
  token: string
}

const stamp = Date.now()

export async function createTestUser(tag: string): Promise<TestUser> {
  const email = `it-${tag}-${stamp}-${Math.random().toString(36).slice(2, 7)}@sova.local`
  const password = `Lozinka-${stamp}-${tag}!`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: signed, error: signErr } = await client.auth.signInWithPassword({ email, password })
  if (signErr || !signed.session) throw signErr ?? new Error('no session')
  return { id: data.user.id, email, token: signed.session.access_token }
}

export async function deleteTestUser(user: TestUser | undefined): Promise<void> {
  if (!user) return
  const { error } = await admin.auth.admin.deleteUser(user.id)
  // ne sme tiho da padne: tako su se gomilali test podaci i sakrivali bagovi kaskade (migracije 018 i 020)
  if (error && !/not found/i.test(error.message))
    throw new Error(`Brisanje test korisnika ${user.email}: ${error.message}`)
}

type RouteHandler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>

export interface CallOptions {
  method?: string
  token?: string
  body?: unknown
  params?: Record<string, string>
  query?: Record<string, string>
  headers?: Record<string, string>
}

export async function call<T = unknown>(
  handler: RouteHandler,
  path: string,
  opts: CallOptions = {},
): Promise<{
  status: number
  json: {
    ok: boolean
    data?: T
    error?: { code: string; message: string; fields?: Record<string, string[]> }
  }
}> {
  const url = new URL(path, APP_URL)
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v)
  const headers = new Headers({ origin: APP_URL, ...(opts.headers ?? {}) })
  if (opts.token) headers.set('authorization', `Bearer ${opts.token}`)
  let body: string | undefined
  if (opts.body !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(opts.body)
  }
  const method = opts.method ?? (body ? 'POST' : 'GET')
  const req = new NextRequest(url, { method, headers, body })
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) })
  const json = (await res.json()) as {
    ok: boolean
    data?: T
    error?: { code: string; message: string; fields?: Record<string, string[]> }
  }
  return { status: res.status, json }
}
