import { z } from 'zod'

import { contentLocaleSchema } from '@/config/locales'
import { PHOTO_SOURCES, STYLE_IDS } from '@/lib/visuals/design/catalog'

/** Tokovi automatizacije (D-108, faza 3). */
export const FLOW_FORMATS = ['carousel', 'single', 'story'] as const
export type FlowFormat = (typeof FLOW_FORMATS)[number]

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Vreme se upisuje kao HH:MM.' })
const collaborator = z
  .string()
  .trim()
  .regex(/^@?[A-Za-z0-9._]{1,30}$/, { error: 'Instagram nalog ima slova, brojeve, tačku i donju crtu.' })
  .transform((v) => v.replace(/^@/, '').toLowerCase())

const fields = {
  name: z.string().trim().min(1, { error: 'Upišite naziv toka.' }).max(80),
  topic: z.string().trim().min(3, { error: 'Opišite temu toka.' }).max(2000),
  cta: z.string().trim().max(300).nullable(),
  ctaMode: z.enum(['none', 'dm']),
  format: z.enum(FLOW_FORMATS),
  styleId: z.enum(STYLE_IDS).nullable(),
  slides: z.number().int().min(1).max(10).nullable(),
  photoSource: z.enum(PHOTO_SOURCES).nullable(),
  /** galerija (D-114): fotografije samo iz ove kategorije; null = cela galerija */
  galleryCategoryId: z.uuid().nullable(),
  locale: contentLocaleSchema.nullable(),
  autoAccounts: z.boolean(),
  accountIds: z.array(z.uuid()).max(30),
  days: z
    .array(z.number().int().min(0).max(6))
    .min(1, { error: 'Izaberite bar jedan dan.' })
    .max(7)
    .transform((d) => [...new Set(d)].sort()),
  timeLocal: time,
  autoTime: z.boolean(),
  collaborators: z.array(collaborator).max(3, { error: 'Najviše tri saradnika.' }),
  active: z.boolean(),
}

function checks(
  v: { autoAccounts?: boolean; accountIds?: string[]; format?: FlowFormat; slides?: number | null },
  ctx: z.RefinementCtx,
) {
  if (v.autoAccounts === false && (v.accountIds?.length ?? 0) === 0)
    ctx.addIssue({
      code: 'custom',
      path: ['accountIds'],
      message: 'Izaberite bar jedan nalog ili uključite sve povezane mreže.',
    })
  if (v.format === 'carousel' && v.slides != null && v.slides < 3)
    ctx.addIssue({ code: 'custom', path: ['slides'], message: 'Karusel ima bar tri slajda.' })
  if (v.format === 'story' && v.slides != null && v.slides > 5)
    ctx.addIssue({ code: 'custom', path: ['slides'], message: 'Priča ima najviše pet slajdova.' })
}

export const createFlowSchema = z
  .object({
    brandId: z.uuid(),
    name: fields.name,
    topic: fields.topic,
    cta: fields.cta.optional(),
    ctaMode: fields.ctaMode.default('none'),
    format: fields.format.default('carousel'),
    styleId: fields.styleId.optional(),
    slides: fields.slides.optional(),
    photoSource: fields.photoSource.optional(),
    galleryCategoryId: fields.galleryCategoryId.optional(),
    locale: fields.locale.optional(),
    autoAccounts: fields.autoAccounts.default(true),
    accountIds: fields.accountIds.default([]),
    days: fields.days.default([1, 3, 5]),
    timeLocal: fields.timeLocal.default('10:00'),
    autoTime: fields.autoTime.default(false),
    collaborators: fields.collaborators.default([]),
    active: fields.active.default(true),
  })
  .superRefine(checks)
export type CreateFlowInput = z.infer<typeof createFlowSchema>

export const updateFlowSchema = z
  .object({
    name: fields.name.optional(),
    topic: fields.topic.optional(),
    cta: fields.cta.optional(),
    ctaMode: fields.ctaMode.optional(),
    format: fields.format.optional(),
    styleId: fields.styleId.optional(),
    slides: fields.slides.optional(),
    photoSource: fields.photoSource.optional(),
    galleryCategoryId: fields.galleryCategoryId.optional(),
    locale: fields.locale.optional(),
    autoAccounts: fields.autoAccounts.optional(),
    accountIds: fields.accountIds.optional(),
    days: fields.days.optional(),
    timeLocal: fields.timeLocal.optional(),
    autoTime: fields.autoTime.optional(),
    collaborators: fields.collaborators.optional(),
    active: fields.active.optional(),
  })
  .superRefine(checks)
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: 'Nema izmena.' })
export type UpdateFlowInput = z.infer<typeof updateFlowSchema>

export const listFlowsQuerySchema = z.object({ brandId: z.uuid() })
