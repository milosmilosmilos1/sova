import { z } from 'zod'

import { VOICE_TOPICS_MAX, voiceTopicSchema } from '@/lib/schemas/voice'

/** Uvod u sedam koraka i dokumenti o brendu (D-112). */
export const SETUP_STEPS = ['welcome', 'networks', 'analysis', 'brand', 'colors', 'style', 'done'] as const
export type SetupStep = (typeof SETUP_STEPS)[number]

/** PDF o brendu: do 10 MB (granica skladišta brand-assets), najviše 10 po brendu. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
export const MAX_DOCUMENTS = 10

const documentName = z.string().trim().min(1, { error: 'Fajl nema ime.' }).max(200)

export const documentUploadSchema = z.object({
  name: documentName,
  sizeBytes: z
    .number()
    .int()
    .positive({ error: 'Fajl je prazan.' })
    .max(MAX_DOCUMENT_BYTES, { error: 'PDF može imati najviše 10 MB.' }),
})

export const documentCompleteSchema = z.object({
  uploadId: z.uuid({ error: 'Neispravan identifikator otpremanja.' }),
  name: documentName,
})

export const documentParamsSchema = z.object({
  id: z.uuid({ error: 'Neispravan identifikator.' }),
  documentId: z.uuid({ error: 'Neispravan identifikator dokumenta.' }),
})

/** Kraj uvoda: teme postaju tokovi (aktivne prave nacrte odmah po rasporedu), ili preskok bez tokova. */
export const completeSetupSchema = z.object({
  flows: z
    .array(z.object({ topic: voiceTopicSchema, active: z.boolean() }))
    .max(VOICE_TOPICS_MAX, { error: `Najviše ${VOICE_TOPICS_MAX} tokova.` })
    .default([]),
  skip: z.boolean().default(false),
})
export type CompleteSetupInput = z.infer<typeof completeSetupSchema>

/** Dani pripreme za n-ti tok iz uvoda: dva dana nedeljno, pomereno da se nacrti ne gomilaju istog dana. */
export function setupFlowDays(index: number): number[] {
  const pairs = [
    [1, 4],
    [2, 5],
    [3, 6],
  ]
  return pairs[index % pairs.length]!
}
