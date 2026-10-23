/**
 * Content-Security-Policy. Čista funkcija, testira se bez Next-a.
 * Skripte: nonce + strict-dynamic. Stilovi: 'unsafe-inline' zbog Radix/inline style atributa.
 */
export interface CspInput {
  nonce: string
  isDev: boolean
  supabaseUrl?: string
  extraConnect?: string[]
  extraImg?: string[]
}

const IMG_HOSTS = [
  'https://images.unsplash.com',
  'https://*.canva.com',
  'https://*.fbcdn.net',
  'https://*.cdninstagram.com',
  'https://*.licdn.com',
  'https://*.ytimg.com',
  'https://*.pinimg.com',
  'https://*.tiktokcdn.com',
  'https://*.tiktokcdn-us.com',
  'https://lh3.googleusercontent.com',
  'https://pbs.twimg.com',
]

function supabaseOrigins(supabaseUrl?: string): { http: string; ws: string } | null {
  if (!supabaseUrl) return null
  try {
    const u = new URL(supabaseUrl)
    const http = `${u.protocol}//${u.host}`
    const ws = `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`
    return { http, ws }
  } catch {
    return null
  }
}

export function buildCsp(input: CspInput): string {
  const sb = supabaseOrigins(input.supabaseUrl)
  const connect = [
    "'self'",
    ...(sb ? [sb.http, sb.ws] : []),
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://*.ingest.sentry.io',
    'https://*.ingest.de.sentry.io',
    'https://*.posthog.com',
    'https://*.i.posthog.com',
    'https://challenges.cloudflare.com',
    'https://api.stripe.com',
    ...(input.isDev
      ? ['ws://localhost:*', 'http://localhost:*', 'ws://127.0.0.1:*', 'http://127.0.0.1:*']
      : []),
    ...(input.extraConnect ?? []),
  ]
  const img = [
    "'self'",
    'blob:',
    'data:',
    ...(sb ? [sb.http] : []),
    'https://*.supabase.co',
    ...IMG_HOSTS,
    ...(input.extraImg ?? []),
  ]
  const directives = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `form-action 'self' https://checkout.stripe.com https://billing.stripe.com`,
    `script-src 'self' 'nonce-${input.nonce}' 'strict-dynamic' https://challenges.cloudflare.com https://js.stripe.com${input.isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `img-src ${img.join(' ')}`,
    `media-src 'self' blob: ${sb ? sb.http : ''} https://*.supabase.co`.replace(/\s+/g, ' ').trim(),
    `connect-src ${connect.join(' ')}`,
    `frame-src 'self' https://challenges.cloudflare.com https://js.stripe.com https://checkout.stripe.com https://www.canva.com`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    ...(input.isDev ? [] : ['upgrade-insecure-requests']),
  ]
  return directives.join('; ')
}
