import { describe, expect, it } from 'vitest'

import { detectEnvMode, parseServerEnv } from './env.schema'

const base: Record<string, string> = {
  NEXT_PUBLIC_APP_URL: 'http://localhost:3001',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-anon-key-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-service-role',
  TOKEN_ENCRYPTION_KEY: 'v1:YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=',
  CRON_SECRET: 'cron-secret-1234567890',
  IMPERSONATION_SECRET: 'impersonation-secret-with-at-least-32-chars',
}

describe('env schema', () => {
  it('u dev režimu spoljni servisi su opcioni, modeli imaju podrazumevane vrednosti', () => {
    const env = parseServerEnv({ ...base, NODE_ENV: 'development' }, 'dev')
    expect(env.GEMINI_TEXT_MODEL).toBe('gemini-3.6-flash')
    expect(env.GEMINI_IMAGE_MODEL).toBe('gemini-3.1-flash-image')
    expect(env.GEMINI_EMBEDDING_MODEL).toBe('gemini-embedding-2')
    expect(env.UPSTASH_REDIS_REST_URL).toBeUndefined()
  })

  it('u dev režimu osnovne tajne su ipak obavezne', () => {
    expect(() => parseServerEnv({ NODE_ENV: 'development' }, 'dev')).toThrow(/TOKEN_ENCRYPTION_KEY/)
  })

  it('u prod režimu Upstash, Inngest i Gemini ključ su obavezni', () => {
    expect(() => parseServerEnv({ ...base, NODE_ENV: 'production' }, 'prod')).toThrow(
      /UPSTASH_REDIS_REST_URL/,
    )
  })

  it('odbija ključ za enkripciju bez verzije', () => {
    expect(() => parseServerEnv({ ...base, TOKEN_ENCRYPTION_KEY: 'c2VjcmV0' }, 'dev')).toThrow(/v1:/)
  })

  it('u build fazi ne traži ništa', () => {
    expect(() => parseServerEnv({}, 'build')).not.toThrow()
  })

  it('detektuje režim', () => {
    expect(detectEnvMode({ NEXT_PHASE: 'phase-production-build', NODE_ENV: 'production' })).toBe('build')
    expect(detectEnvMode({ NODE_ENV: 'production' })).toBe('prod')
    expect(detectEnvMode({ NODE_ENV: 'development' })).toBe('dev')
  })
})
