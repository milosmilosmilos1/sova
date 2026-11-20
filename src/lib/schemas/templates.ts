import { z } from 'zod'

import {
  TEMPLATE_FORMATS,
  TEMPLATE_IDS,
  TEMPLATES,
  type FieldDef,
  type TemplateId,
} from '@/lib/templates/catalog'

/**
 * Provera unosa za šablone (D-175), iz opisa polja u katalogu. Prazno neobavezno polje je prazan
 * tekst ili null; lista bez praznih stavki.
 */
const tooLong = (max: number) => ({ error: `Najviše ${max} znakova.` })
const REQUIRED = { error: 'Popunite ovo polje.' }

function textField(f: FieldDef) {
  const base = z
    .string()
    .trim()
    .max(f.max ?? 120, tooLong(f.max ?? 120))
  return f.required ? base.min(1, REQUIRED) : base.nullish().transform((v) => v ?? '')
}

const itemText = (max: number) => z.string().trim().max(max, tooLong(max))

function listField(f: FieldDef) {
  const min = f.minItems ?? 0
  const max = f.maxItems ?? 5
  return z
    .array(itemText(f.max ?? 120))
    .max(12, { error: 'Previše stavki.' })
    .nullish()
    .transform((items) => (items ?? []).filter(Boolean))
    .pipe(
      z
        .array(z.string())
        .min(min, { error: min === 1 ? 'Upišite bar jednu stavku.' : `Upišite bar ${min} stavke.` })
        .max(max, { error: `Najviše ${max} stavki.` }),
    )
}

function fieldSchema(f: FieldDef): z.ZodType {
  switch (f.kind) {
    case 'text':
    case 'textarea':
      return textField(f)
    case 'photo':
      return f.required
        ? z.uuid({ error: 'Izaberite fotografiju.' })
        : z
            .uuid({ error: 'Izaberite fotografiju.' })
            .nullish()
            .transform((v) => v ?? null)
    case 'photos':
      return z
        .array(z.uuid({ error: 'Izaberite fotografiju.' }))
        .min(f.minItems ?? 1, { error: 'Izaberite bar jednu fotografiju.' })
        .max(f.maxItems ?? 6, { error: `Najviše ${f.maxItems ?? 6} fotografija.` })
    case 'list':
      return listField(f)
    case 'pairs':
      return z
        .array(
          z.object({
            q: itemText(140).min(1, REQUIRED),
            a: itemText(300).min(1, REQUIRED),
          }),
        )
        .min(f.minItems ?? 1, { error: 'Upišite bar jedno pitanje i odgovor.' })
        .max(f.maxItems ?? 5, { error: `Najviše ${f.maxItems ?? 5} pitanja.` })
    case 'prices':
      return z
        .array(z.object({ name: itemText(60).min(1, REQUIRED), price: itemText(30).min(1, REQUIRED) }))
        .min(f.minItems ?? 1, { error: 'Upišite bar jednu stavku sa cenom.' })
        .max(f.maxItems ?? 8, { error: `Najviše ${f.maxItems ?? 8} stavki.` })
    case 'rating':
      return z
        .number()
        .int()
        .min(1, { error: 'Ocena je od 1 do 5.' })
        .max(5, { error: 'Ocena je od 1 do 5.' })
        .nullish()
        .transform((v) => v ?? null)
    case 'date': {
      const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Izaberite datum.' })
      return f.required
        ? day
        : z
            .union([day, z.literal('')])
            .nullish()
            .transform((v) => v || null)
    }
    case 'time':
      return z
        .union([
          z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Vreme je u obliku 18:30.' }),
          z.literal(''),
        ])
        .nullish()
        .transform((v) => v || null)
    case 'choice':
      return z.number().int().min(0).max(3, { error: 'Izaberite tačan odgovor.' })
  }
}

/** Podaci jednog šablona; kviz traži da tačan odgovor bude među upisanima. */
export function templateValuesSchema(id: TemplateId) {
  const shape = Object.fromEntries(TEMPLATES[id].fields.map((f) => [f.key, fieldSchema(f)]))
  return z.object(shape).superRefine((v, ctx) => {
    if (id !== 'quiz') return
    const answers = v.answers as string[]
    if ((v.correct as number) >= answers.length)
      ctx.addIssue({ code: 'custom', path: ['correct'], message: 'Izaberite tačan odgovor.' })
  })
}

export type TemplateValues = Record<string, unknown>

const templateBase = {
  templateId: z.enum(TEMPLATE_IDS),
  format: z.enum(TEMPLATE_FORMATS),
  values: z.record(z.string(), z.unknown()),
}

/** Pregled slajdova dok se šablon popunjava. */
export const templatePreviewSchema = z.object(templateBase)

/** Nacrt iz šablona: opis koji je korisnik možda izmenio, mreže i (neobavezno) termin. */
export const templateCreateSchema = z.object({
  ...templateBase,
  caption: z.string().trim().max(2200, { error: 'Opis ima najviše 2.200 znakova.' }).optional(),
  accountIds: z.array(z.uuid()).max(16).default([]),
  scheduledFor: z.iso.datetime({ offset: true }).optional(),
})
export type TemplateCreateInput = z.infer<typeof templateCreateSchema>
