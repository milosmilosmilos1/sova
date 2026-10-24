import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Čisto jezgro impersonacije (D-070): potpis cookie-ja, JWT za ciljnog korisnika i pravila
 * koje radnje su blokirane. Tajne se prosleđuju kao parametri, pa je modul jedinično testiran.
 */
export const IMP_COOKIE = 'sova_imp'
export const IMP_MAX_MINUTES = 30

function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

/** Vrednost cookie-ja: `<sessionId>.<hmac>`; sam ID sesije nije tajna, potpis jeste. */
export function signSessionCookie(sessionId: string, secret: string): string {
  return `${sessionId}.${hmac(secret, `imp:${sessionId}`)}`
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function verifySessionCookie(value: string | null | undefined, secret: string): string | null {
  if (!value) return null
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return null
  const id = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  if (!UUID.test(id)) return null
  const expected = hmac(secret, `imp:${id}`)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return id
}

export interface ImpersonationClaims {
  userId: string
  email: string
  sessionId: string
  adminId: string
  readOnly: boolean
  /** kraj sesije (ISO); token ne sme da važi duže */
  expiresAt: string
  supabaseUrl: string
}

const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url')

/** HS256 JWT koji PostgREST prihvata kao token ciljnog korisnika (`imp.ro` čitaju RLS politike). */
export function mintImpersonationJwt(
  claims: ImpersonationClaims,
  jwtSecret: string,
  now = new Date(),
): string {
  const iat = Math.floor(now.getTime() / 1000)
  const cap = iat + IMP_MAX_MINUTES * 60
  const exp = Math.min(cap, Math.floor(new Date(claims.expiresAt).getTime() / 1000))
  const header = b64({ alg: 'HS256', typ: 'JWT' })
  const payload = b64({
    aud: 'authenticated',
    role: 'authenticated',
    iss: `${claims.supabaseUrl.replace(/\/+$/, '')}/auth/v1`,
    sub: claims.userId,
    email: claims.email,
    iat,
    exp,
    is_anonymous: false,
    imp: { sid: claims.sessionId, ro: claims.readOnly, adm: claims.adminId },
  })
  const signature = createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1] ?? ''
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Rute koje ni pun režim ne dozvoljava (brif 16): naplata, brisanje, povezivanje i odvajanje mreža,
 * objavljivanje, Autopilot, tim, nalog. Putanje su API putanje bez query-ja.
 */
const FULL_MODE_FORBIDDEN: Array<{ re: RegExp; reason: string }> = [
  { re: /^\/api\/(billing|payments|checkout)(\/|$)/, reason: 'Naplata nije dozvoljena tokom impersonacije.' },
  {
    re: /^\/api\/(account|auth|profile\/(password|email))(\/|$)/,
    reason: 'Nalog, lozinka i email se ne menjaju tokom impersonacije.',
  },
  { re: /^\/api\/workspaces\/[^/]+\/transfer$/, reason: 'Vlasništvo se ne prenosi tokom impersonacije.' },
  { re: /^\/api\/integrations\//, reason: 'Povezivanje mreža i Canve nije dozvoljeno tokom impersonacije.' },
  {
    re: /^\/api\/social-accounts(\/|$)/,
    reason: 'Povezivanje i odvajanje mreža nije dozvoljeno tokom impersonacije.',
  },
  { re: /^\/api\/canva\/connection(\/|$)/, reason: 'Povezivanje Canve nije dozvoljeno tokom impersonacije.' },
  {
    re: /^\/api\/posts\/[^/]+\/(schedule|publish-now|resume)$/,
    reason: 'Objavljivanje nije dozvoljeno tokom impersonacije.',
  },
  { re: /^\/api\/posts\/[^/]+\/targets\//, reason: 'Objavljivanje nije dozvoljeno tokom impersonacije.' },
  { re: /^\/api\/autopilot\//, reason: 'Autopilot se ne menja tokom impersonacije.' },
  {
    re: /^\/api\/(team|invitations|members)(\/|$)/,
    reason: 'Tim i pozivnice se ne menjaju tokom impersonacije.',
  },
  {
    re: /^\/api\/workspaces\/[^/]+\/(members|invitations)(\/|$)/,
    reason: 'Tim i pozivnice se ne menjaju tokom impersonacije.',
  },
  // izmena podešavanja radnog prostora je obična izmena (kao serverska akcija updateWorkspace); novi prostor nije
  { re: /^\/api\/workspaces\/?$/, reason: 'Novi radni prostor se ne pravi tokom impersonacije.' },
]

export const READ_ONLY_MESSAGE =
  'Gledate aplikaciju kao korisnik u režimu samo za čitanje. Izmene nisu dozvoljene; za pun režim pokrenite novu sesiju iz admin panela.'

/** Razlog blokade za API zahtev tokom impersonacije, ili null kad je zahtev dozvoljen. */
export function impersonationBlock(readOnly: boolean, method: string, pathname: string): string | null {
  const m = method.toUpperCase()
  if (!MUTATING.has(m)) return null
  if (readOnly) return READ_ONLY_MESSAGE
  if (m === 'DELETE') return 'Brisanje nije dozvoljeno tokom impersonacije.'
  for (const rule of FULL_MODE_FORBIDDEN) if (rule.re.test(pathname)) return rule.reason
  return null
}

/** Serverske akcije: šta sme da se radi tokom impersonacije. */
export type ActionKind = 'navigation' | 'edit' | 'forbidden'

export function actionBlock(readOnly: boolean, kind: ActionKind): string | null {
  if (kind === 'navigation') return null
  if (kind === 'forbidden') return 'Ova radnja nije dozvoljena tokom impersonacije.'
  return readOnly ? READ_ONLY_MESSAGE : null
}
