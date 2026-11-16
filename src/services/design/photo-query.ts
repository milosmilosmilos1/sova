import 'server-only'

import { classifyProviderError } from '@/lib/ai/errors'
import { generateText } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback } from '@/lib/ai/orchestrator'
import {
  buildPhotoQueryPrompt,
  buildPhotoQuerySystemPrompt,
  cleanPhotoQuery,
  photoQueryJsonSchema,
  photoQuerySchema,
} from '@/lib/ai/prompts/photo-query'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

import type { PostDesignContext } from './post-design'

/**
 * Upit za fotografije dizajnirane objave (D-167): engleski upit koji je model napisao uz tekst
 * objave čuva se u `posts.design.photoQuery`. Usklađivanje sa temom i izmena u Studiju traže nove
 * fotografije po njemu, a ne po temi na srpskom, koju pretraga ne razume.
 */
type QueryDesign = Pick<PostDesignContext, 'topic' | 'photoQuery' | 'copy'>

/** Sačuvan upit, a bez njega tema (kada se nove fotografije ionako ne traže). */
export function photoQueryOf(design: Pick<PostDesignContext, 'topic' | 'photoQuery'>): string {
  return (design.photoQuery || design.topic).slice(0, 100)
}

/**
 * Upit za objavu koja traži nove fotografije: sačuvan, ili ga Gemini napiše iz teme i naslova
 * slajdova (starije objave). Bez ključa ili posle greške ostaje tema, kao ranije.
 */
export async function resolvePhotoQuery(design: QueryDesign): Promise<string> {
  if (design.photoQuery) return design.photoQuery.slice(0, 100)
  const fallback = design.topic.slice(0, 100)
  if (!env.GEMINI_API_KEY) return fallback
  try {
    const outcome = await callWithFallback(
      await textModelChain(),
      (model) =>
        generateText({
          model,
          system: buildPhotoQuerySystemPrompt(),
          prompt: buildPhotoQueryPrompt({
            topic: design.topic,
            titles: (design.copy?.slides ?? []).map((s) => s.title),
          }),
          jsonSchema: photoQueryJsonSchema(),
          maxOutputTokens: 120,
          temperature: 0.2,
          thinking: 'minimal',
          timeoutMs: 10_000,
        }),
      { label: 'photo-query', attempts: 1 },
    )
    const parsed = photoQuerySchema.safeParse(outcome.result.json)
    const query = parsed.success ? cleanPhotoQuery(parsed.data.query) : ''
    return query || fallback
  } catch (error) {
    logger.warn('photo_query_failed', { code: classifyProviderError(error).code })
    return fallback
  }
}
