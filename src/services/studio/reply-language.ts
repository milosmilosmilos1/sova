import 'server-only'

import { z } from 'zod'

import { classifyProviderError } from '@/lib/ai/errors'
import { generateText } from '@/lib/ai/gemini'
import { textModelChain } from '@/lib/ai/models'
import { callWithFallback } from '@/lib/ai/orchestrator'
import type { NormalizedStudioDecision } from '@/lib/ai/prompts/studio'
import { isInLocale, LOCALE_TARGET } from '@/lib/ai/reply-language'
import type { AppLocale } from '@/i18n/config'
import { logger } from '@/lib/logger'

const translatedSchema = z.object({ reply: z.string(), suggestions: z.array(z.string()) })

function translatedJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(translatedSchema) as Record<string, unknown>
  delete schema.$schema
  return schema
}

/**
 * Odgovor Sove na jeziku razgovora (D-156): kad su odgovor ili predlozi na drugom jeziku (jezik brenda,
 * srodan jezik, ukrajinski latinicom), jedan kratak poziv ih prevodi. Neuspeo prevod ostavlja odgovor
 * kakav jeste, jer je i takav bolji od greške u razgovoru.
 */
export async function inConversationLanguage(
  decision: NormalizedStudioDecision,
  locale: AppLocale,
): Promise<NormalizedStudioDecision> {
  if (isInLocale([decision.reply, ...decision.suggestions].join('\n'), locale)) return decision
  try {
    const outcome = await callWithFallback(
      await textModelChain(),
      (model) =>
        generateText({
          model,
          system:
            'Prevodiš kratke poruke asistenta u aplikaciji za društvene mreže. Vraćaš isključivo JSON po šemi.',
          prompt: [
            `Prevedi reply i svaki predlog na: ${LOCALE_TARGET[locale]}. Zadrži smisao, ton i dužinu; nazive stilova, brendova i mreža ostavi kakvi jesu.`,
            '<<<PODACI>>>',
            JSON.stringify({ reply: decision.reply, suggestions: decision.suggestions }),
            '<<<KRAJ PODATAKA>>>',
          ].join('\n'),
          jsonSchema: translatedJsonSchema(),
          maxOutputTokens: 1024,
          temperature: 0,
          thinking: 'minimal',
          timeoutMs: 8_000,
        }),
      { label: 'studio-reply-language', attempts: 1 },
    )
    const parsed = translatedSchema.safeParse(outcome.result.json)
    if (!parsed.success || !isInLocale(parsed.data.reply, locale)) return decision
    const suggestions = parsed.data.suggestions
      .map((s) => s.trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, decision.suggestions.length)
    return {
      ...decision,
      reply: parsed.data.reply.trim().slice(0, 1500) || decision.reply,
      suggestions: suggestions.length === decision.suggestions.length ? suggestions : decision.suggestions,
    }
  } catch (error) {
    logger.warn('studio_reply_language_failed', { locale, code: classifyProviderError(error).code })
    return decision
  }
}
