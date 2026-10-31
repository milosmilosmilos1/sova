import { z } from 'zod'

/** Radnje nad više stavki odjednom (D-119). */
const ids = z
  .array(z.uuid())
  .min(1, { error: 'Označite bar jednu stavku.' })
  .max(100, { error: 'Odjednom može najviše 100 stavki.' })

export const postsBulkSchema = z.object({
  ids,
  action: z.enum(['delete', 'skip', 'schedule']),
  /** zakazivanje (D-127): termin po nacrtu; nacrt bez termina ide u svoj termin iz plana */
  at: z.record(z.uuid(), z.iso.datetime({ offset: true })).optional(),
})
export const galleryDeleteSchema = z.object({ brandId: z.uuid(), ids })
