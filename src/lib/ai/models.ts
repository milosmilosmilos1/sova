import 'server-only'

import { env } from '@/lib/env'

/** Nazivi modela samo iz env-a (brif 3); ovde su lanci fallback-a. */
export function textModelChain(): string[] {
  return unique([env.GEMINI_TEXT_MODEL, env.GEMINI_TEXT_FALLBACK_MODEL])
}

export function imageModelChain(quality: 'standard' | 'premium'): string[] {
  if (quality === 'premium') {
    return unique([env.GEMINI_IMAGE_PREMIUM_MODEL, env.GEMINI_IMAGE_MODEL, env.GEMINI_IMAGE_FALLBACK_MODEL])
  }
  return unique([env.GEMINI_IMAGE_MODEL, env.GEMINI_IMAGE_FALLBACK_MODEL])
}

export function embeddingModel(): string {
  return env.GEMINI_EMBEDDING_MODEL
}

function unique(list: string[]): string[] {
  return [...new Set(list.filter(Boolean))]
}
