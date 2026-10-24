import { z } from 'zod'

/**
 * Šema env varijabli. Čista funkcija bez side-effecta da bi se testirala.
 *
 * Režimi:
 *  - 'prod'  : sve obavezno (Vercel Production i Preview).
 *  - 'dev'   : spoljni servisi su opcioni (vidi docs/DECISIONS.md D-014).
 *  - 'build' : `next build` ne validira ništa; validacija se radi pri startu servera.
 */
export type EnvMode = 'prod' | 'dev' | 'build'

const secret32 = z.string().min(32, 'mora imati najmanje 32 karaktera')

/** Format: v<broj>:<base64 32 bajta>. Verzija omogućava rotaciju ključa. */
const encryptionKey = z.string().regex(/^v\d+:[A-Za-z0-9+/=]{43,46}$/, {
  message: 'format je v1:<base64 ključ od 32 bajta>; napravi ga sa: openssl rand -base64 32',
})

export function buildServerEnvSchema(mode: EnvMode) {
  const strict = mode === 'prod'
  const always = <T extends z.ZodType>(s: T) => (mode === 'build' ? s.optional() : s)
  const prodOnly = <T extends z.ZodType>(s: T) => (strict ? s : s.optional())

  return z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Aplikacija
    NEXT_PUBLIC_APP_URL: always(z.url()),
    // javni URL medija za mreže koje same preuzimaju fajl (TikTok PULL_FROM_URL traži domen
    // verifikovan u TikTok portalu); prazno = NEXT_PUBLIC_APP_URL
    PUBLIC_MEDIA_BASE_URL: z.url().optional(),
    // najveći video u biblioteci (MB); Supabase besplatan plan ne prima fajl veći od 50 MB
    MEDIA_MAX_VIDEO_MB: z.coerce.number().int().min(5).max(5000).default(50),

    // Supabase
    NEXT_PUBLIC_SUPABASE_URL: always(z.url()),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: always(z.string().min(20)),
    SUPABASE_SERVICE_ROLE_KEY: always(z.string().min(20)),
    SUPABASE_JWT_SECRET: z.string().min(32).optional(),

    // Tajne aplikacije
    TOKEN_ENCRYPTION_KEY: always(encryptionKey),
    CRON_SECRET: always(z.string().min(16)),
    IMPERSONATION_SECRET: always(secret32),

    // Gemini
    GEMINI_API_KEY: prodOnly(z.string().min(10)),
    GEMINI_TEXT_MODEL: z.string().default('gemini-3.8-flash'),
    GEMINI_TEXT_FALLBACK_MODEL: z.string().default('gemini-3.5-flash-lite'),
    GEMINI_IMAGE_MODEL: z.string().default('gemini-3.1-flash-image'),
    GEMINI_IMAGE_PREMIUM_MODEL: z.string().default('gemini-3-pro-image'),
    GEMINI_IMAGE_FALLBACK_MODEL: z.string().default('gemini-3.1-flash-lite-image'),
    GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-2'),

    // Vizuali
    UNSPLASH_ACCESS_KEY: prodOnly(z.string().min(10)),
    UNSPLASH_APP_NAME: z.string().default('sova'),
    CANVA_CLIENT_ID: prodOnly(z.string().min(5)),
    CANVA_CLIENT_SECRET: prodOnly(z.string().min(10)),
    FIRECRAWL_API_KEY: z.string().optional(),

    // Mreže (sve opcione dok odgovarajući feature flag nije uključen)
    META_APP_ID: z.string().optional(),
    META_APP_SECRET: z.string().optional(),
    META_GRAPH_VERSION: z
      .string()
      .regex(/^v[0-9]+[.][0-9]+$/)
      .default('v26.0'),
    META_LOGIN_CONFIG_ID: z.string().optional(),
    LINKEDIN_CLIENT_ID: z.string().optional(),
    LINKEDIN_CLIENT_SECRET: z.string().optional(),
    LINKEDIN_API_VERSION: z
      .string()
      .regex(/^\d{6}$/)
      .default('202610'),
    // Community Management API (stranice firmi) i Member Post Analytics traže odobrenje LinkedIn-a;
    // dok ga nema, ti scope-ovi se ne traže (scope koji aplikacija nema obara prijavu)
    LINKEDIN_PAGES: z.stringbool().default(false),
    LINKEDIN_MEMBER_ANALYTICS: z.stringbool().default(false),
    TIKTOK_CLIENT_KEY: z.string().optional(),
    TIKTOK_CLIENT_SECRET: z.string().optional(),
    X_CLIENT_ID: z.string().optional(),
    X_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    PINTEREST_APP_ID: z.string().optional(),
    PINTEREST_APP_SECRET: z.string().optional(),
    // Trial pristup: pinovi idu kroz sandbox (vidljivi samo autoru); Standard pristup = false
    PINTEREST_SANDBOX: z.stringbool().default(false),

    // Plaćanje
    PAYMENT_PROVIDER: z.enum(['stripe', 'paddle']).default('stripe'),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
    STRIPE_PRICE_MONTHLY: z.string().optional(),
    STRIPE_PRICE_YEARLY: z.string().optional(),

    // Background i infrastruktura
    INNGEST_EVENT_KEY: prodOnly(z.string().min(10)),
    INNGEST_SIGNING_KEY: prodOnly(z.string().min(10)),
    UPSTASH_REDIS_REST_URL: prodOnly(z.url()),
    UPSTASH_REDIS_REST_TOKEN: prodOnly(z.string().min(10)),

    // Email
    RESEND_API_KEY: prodOnly(z.string().min(10)),
    EMAIL_FROM: z.string().default('Sova <noreply@sovaai.rs>'),

    // Monitoring i zaštita
    SENTRY_DSN: z.url().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.url().optional(),
    TURNSTILE_SECRET_KEY: prodOnly(z.string().min(10)),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: prodOnly(z.string().min(10)),

    // Crawler
    BOT_INFO_URL: z.url().default('https://sovaai.rs/bot'),
  })
}

export type ServerEnv = z.infer<ReturnType<typeof buildServerEnvSchema>>

export type RawEnv = Record<string, string | undefined>

export function detectEnvMode(raw: RawEnv = process.env): EnvMode {
  if (raw.NEXT_PHASE === 'phase-production-build') return 'build'
  if (raw.NODE_ENV === 'production') return 'prod'
  return 'dev'
}

export function parseServerEnv(raw: RawEnv, mode: EnvMode): ServerEnv {
  const result = buildServerEnvSchema(mode).safeParse(raw)
  if (result.success) return result.data
  const flat = z.flattenError(result.error)
  const lines = Object.entries(flat.fieldErrors).map(
    ([name, errors]) => `  - ${name}: ${(errors ?? []).join(', ')}`,
  )
  throw new Error(
    `Env varijable nisu ispravne (režim: ${mode}). Proveri .env.local ili Vercel podešavanja:\n${lines.join('\n')}`,
  )
}
