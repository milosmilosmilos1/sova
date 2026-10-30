import { z } from 'zod'

/** Radnje nad više stavki odjednom (D-119). */
const ids = z
  .array(z.uuid())
  .min(1, { error: 'Označite bar jednu stavku.' })
  .max(100, { error: 'Odjednom može najviše 100 stavki.' })

export const postsBulkSchema = z.object({ ids, action: z.enum(['delete', 'skip']) })
export const galleryDeleteSchema = z.object({ brandId: z.uuid(), ids })
