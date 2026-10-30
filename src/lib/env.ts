import 'server-only'

import { detectEnvMode, parseServerEnv, type ServerEnv } from './env.schema'

const mode = detectEnvMode()

/**
 * Validiran serverski env. Uvoz ovog modula van servera pada zbog `server-only`.
 * Pri startu servera `instrumentation.ts` uvozi ovaj modul da bi aplikacija
 * odmah stala ako nešto fali.
 */
export const env: ServerEnv = parseServerEnv(process.env, mode)

export const isProd = env.NODE_ENV === 'production'
export const isDev = env.NODE_ENV === 'development'
export const isTest = env.NODE_ENV === 'test'
/** Produkcija u režimu pregleda (SOVA_PREVIEW=true): servisi bez ključa se preskaču kao u DEV-u (D-101). */
export const isPreview = mode === 'preview'

/** Koji spoljni servisi su podešeni. U DEV i u pregledu mogu da fale (D-014, D-101). */
export const configured = {
  upstash: Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
  inngestCloud: Boolean(env.INNGEST_EVENT_KEY && env.INNGEST_SIGNING_KEY),
  gemini: Boolean(env.GEMINI_API_KEY),
  resend: Boolean(env.RESEND_API_KEY),
  sentry: Boolean(env.SENTRY_DSN),
  turnstile: Boolean(env.TURNSTILE_SECRET_KEY && env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
  unsplash: Boolean(env.UNSPLASH_ACCESS_KEY),
  pexels: Boolean(env.PEXELS_API_KEY),
  push: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
  canva: Boolean(env.CANVA_CLIENT_ID && env.CANVA_CLIENT_SECRET),
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  meta: Boolean(env.META_APP_ID && env.META_APP_SECRET),
  linkedin: Boolean(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET),
  tiktok: Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET),
  stripe: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
} as const
