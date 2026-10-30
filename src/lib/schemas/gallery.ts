import { z } from 'zod'

/** Galerija brenda (D-114). */
export const DESCRIPTION_MAX = 500
export const CATEGORY_NAME_MAX = 40

const categoryName = z
  .string()
  .trim()
  .min(1, { error: 'Upišite naziv kategorije.' })
  .max(CATEGORY_NAME_MAX, { error: `Naziv ima najviše ${CATEGORY_NAME_MAX} znakova.` })

export const galleryQuerySchema = z.object({
  brandId: z.uuid(),
  /** ID kategorije ili „none” za fotografije bez kategorije */
  category: z.union([z.uuid(), z.literal('none')]).optional(),
})

export const galleryUpdateSchema = z.object({
  brandId: z.uuid(),
  items: z
    .array(
      z.object({
        id: z.uuid(),
        description: z
          .string()
          .trim()
          .max(DESCRIPTION_MAX, { error: `Opis ima najviše ${DESCRIPTION_MAX} znakova.` })
          .nullable()
          .optional(),
        categoryId: z.uuid().nullable().optional(),
      }),
    )
    .min(1, { error: 'Nema izmena.' })
    .max(100),
})

export const categoryCreateSchema = z.object({ brandId: z.uuid(), name: categoryName })
export const categoryUpdateSchema = z.object({ name: categoryName })

export const galleryDescribeSchema = z.object({
  brandId: z.uuid(),
  assetIds: z.array(z.uuid()).min(1).max(6, { error: 'Najviše šest fotografija odjednom.' }),
})
