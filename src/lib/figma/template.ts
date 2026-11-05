import { z } from 'zod'

import type { FigmaNode } from './brand'

/**
 * Figma šablon (D-162): okvir u Figmi u kom su ukrasi u grupi `#pozadina` (preko celog okvira), a
 * mesta za sadržaj su slojevi sa imenom: `#naslov`, `#tekst`, `#oznaka`, `#broj`, `#nalog`,
 * `#brojac`, `#logo`, `#foto`. Sova jednom pročita raspored (mesto, font, veličinu, boju, poravnanje)
 * i posle crta svaku objavu brenda po njemu, sa svojim tekstom, logoom i fotografijom. Šablon ima do
 * tri okvira: naslovni, sadržaj i poziv na akciju (jedan okvir važi za sve).
 */
export const TEMPLATE_ROLES = [
  'title',
  'body',
  'kicker',
  'number',
  'handle',
  'counter',
  'logo',
  'photo',
] as const
export type TemplateRole = (typeof TEMPLATE_ROLES)[number]
export const TEMPLATE_FORMATS = ['portrait', 'square', 'story'] as const
export type TemplateFormat = (typeof TEMPLATE_FORMATS)[number]
export const TEMPLATE_KINDS = ['cover', 'point', 'cta'] as const
export const FIGMA_TEMPLATES_MAX = 12

/** Veličina u koju se šablon preračunava (širina 1080 kao slajdovi Sove). */
export const TEMPLATE_SIZES: Record<TemplateFormat, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
}

const NAMES: Record<string, TemplateRole | 'background'> = {
  pozadina: 'background',
  background: 'background',
  naslov: 'title',
  title: 'title',
  tekst: 'body',
  text: 'body',
  body: 'body',
  opis: 'body',
  oznaka: 'kicker',
  kicker: 'kicker',
  broj: 'number',
  number: 'number',
  nalog: 'handle',
  handle: 'handle',
  brojac: 'counter',
  counter: 'counter',
  logo: 'logo',
  foto: 'photo',
  photo: 'photo',
  slika: 'photo',
}

const TEXT_ROLES: ReadonlySet<TemplateRole> = new Set([
  'title',
  'body',
  'kicker',
  'number',
  'handle',
  'counter',
])

const deburr = (v: string) =>
  v.replace(/[čć]/g, 'c').replace(/š/g, 's').replace(/ž/g, 'z').replace(/đ/g, 'dj')

/** Uloga sloja po imenu: „#naslov”, „#Brojač”, „# foto 1”; bez „#” sloj je ukras. */
export function layerRole(name: string): TemplateRole | 'background' | null {
  const m = /^#\s*([\p{L}]+)/u.exec(name.trim())
  return m ? (NAMES[deburr(m[1]!.toLowerCase())] ?? null) : null
}

const HEX = /^#[0-9A-F]{6}$/
const box = { x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() }

export const templateLayerSchema = z.object({
  role: z.enum(TEMPLATE_ROLES),
  ...box,
  font: z.string().max(80).nullable(),
  weight: z.number().nullable(),
  size: z.number().positive().nullable(),
  lineHeight: z.number().positive().nullable(),
  letterSpacing: z.number().nullable(),
  align: z.enum(['left', 'center', 'right']).nullable(),
  valign: z.enum(['top', 'center', 'bottom']).nullable(),
  upper: z.boolean(),
  color: z.string().regex(HEX).nullable(),
  radius: z.number().min(0).nullable(),
})
export type TemplateLayer = z.infer<typeof templateLayerSchema>

export const templateFrameSchema = z.object({
  nodeId: z.string().max(120),
  name: z.string().max(300),
  fill: z.string().regex(HEX),
  background: z.object({ assetId: z.uuid(), ...box }),
  layers: z.array(templateLayerSchema).max(16),
})
export type TemplateFrame = z.infer<typeof templateFrameSchema>

export const figmaTemplateSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{10}$/),
  name: z.string().trim().min(1).max(80),
  fileKey: z.string().regex(/^[A-Za-z0-9]{10,64}$/),
  format: z.enum(TEMPLATE_FORMATS),
  frames: z.object({ cover: templateFrameSchema, point: templateFrameSchema, cta: templateFrameSchema }),
  createdAt: z.string().max(40),
})
export type FigmaTemplate = z.infer<typeof figmaTemplateSchema>

/** Format po odnosu stranica okvira (do 3% odstupanja); drugačiji okvir nije šablon za objavu. */
export function templateFormat(width: number, height: number): TemplateFormat | null {
  const ratio = width / height
  for (const format of TEMPLATE_FORMATS) {
    const size = TEMPLATE_SIZES[format]
    if (Math.abs(ratio / (size.width / size.height) - 1) <= 0.03) return format
  }
  return null
}

const hex2 = (v: number) =>
  Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()

function solidColor(node: FigmaNode): string | null {
  if (!Array.isArray(node.fills)) return null
  const paint = (
    node.fills as Array<{ type: string; visible?: boolean; color?: { r: number; g: number; b: number } }>
  ).find((p) => p.type === 'SOLID' && p.visible !== false && p.color)
  return paint?.color ? `#${hex2(paint.color.r)}${hex2(paint.color.g)}${hex2(paint.color.b)}` : null
}

export interface ParsedFrame {
  nodeId: string
  name: string
  format: TemplateFormat | null
  fill: string
  /** grupa `#pozadina`: izvozi se kao slika i crta na svom mestu */
  background: { nodeId: string; x: number; y: number; w: number; h: number } | null
  layers: TemplateLayer[]
  problems: string[]
}

/**
 * Raspored okvira preračunat na širinu 1080: mesto svakog sloja u odnosu na okvir, font, veličina,
 * proredi, poravnanje i boja teksta. Slojevi unutar `#pozadina` su deo slike i ne čitaju se.
 */
export function parseTemplateFrame(frame: FigmaNode): ParsedFrame {
  const origin = frame.absoluteBoundingBox ?? { x: 0, y: 0, width: 1080, height: 1350 }
  const format = templateFormat(origin.width, origin.height)
  const scale = (format ? TEMPLATE_SIZES[format].width : 1080) / origin.width
  const at = (n: FigmaNode) => {
    const b = n.absoluteBoundingBox
    if (!b) return null
    return {
      x: (b.x - origin.x) * scale,
      y: (b.y - origin.y) * scale,
      w: b.width * scale,
      h: b.height * scale,
    }
  }
  const problems: string[] = []
  let background: ParsedFrame['background'] = null
  const layers: TemplateLayer[] = []
  const seen = new Set<TemplateRole>()

  const walk = (node: FigmaNode, inside: boolean) => {
    if (node.visible === false) return
    const role = layerRole(node.name)
    if (role === 'background' && !inside) {
      const place = at(node)
      if (place && !background) background = { nodeId: node.id, ...place }
      for (const child of node.children ?? []) walk(child, true)
      return
    }
    if (role && role !== 'background') {
      if (inside) {
        problems.push(`Sloj „${node.name}” je u grupi #pozadina, pa bi ostao na slici; izvucite ga iz nje.`)
      } else if (!seen.has(role)) {
        const place = at(node)
        const text = TEXT_ROLES.has(role)
        if (place && (!text || node.type === 'TEXT')) {
          seen.add(role)
          const st = node.style ?? {}
          const align = st.textAlignHorizontal
          layers.push({
            role,
            ...place,
            font: text ? (st.fontFamily ?? null) : null,
            weight: text ? (st.fontWeight ?? null) : null,
            size: text && st.fontSize ? st.fontSize * scale : null,
            lineHeight: text && st.lineHeightPx ? st.lineHeightPx * scale : null,
            letterSpacing: text && st.letterSpacing ? st.letterSpacing * scale : null,
            align: !text ? null : align === 'CENTER' ? 'center' : align === 'RIGHT' ? 'right' : 'left',
            valign: !text
              ? null
              : st.textAlignVertical === 'CENTER'
                ? 'center'
                : st.textAlignVertical === 'BOTTOM'
                  ? 'bottom'
                  : 'top',
            upper: text && st.textCase === 'UPPER',
            color: text ? solidColor(node) : null,
            radius: !text && typeof node.cornerRadius === 'number' ? node.cornerRadius * scale : null,
          })
          return
        }
        if (text && node.type !== 'TEXT') problems.push(`Sloj „${node.name}” mora biti tekst.`)
      }
    }
    for (const child of node.children ?? []) walk(child, inside)
  }
  for (const child of frame.children ?? []) walk(child, false)

  if (!format)
    problems.push(
      `Okvir „${frame.name}” nije 4:5, 1:1 ni 9:16 (${Math.round(origin.width)}×${Math.round(origin.height)}).`,
    )
  if (!background) problems.push(`Okvir „${frame.name}” nema grupu #pozadina sa ukrasima.`)
  if (!seen.has('title')) problems.push(`Okvir „${frame.name}” nema tekst #naslov.`)
  return {
    nodeId: frame.id,
    name: frame.name,
    format,
    fill: solidColor(frame) ?? '#FFFFFF',
    background,
    layers,
    problems,
  }
}

/** Okvir šablona za vrstu slajda: naslovni, sadržaj ili poziv na akciju. */
export function templateFrameFor(template: FigmaTemplate, kind: string): TemplateFrame {
  return kind === 'cover'
    ? template.frames.cover
    : kind === 'cta'
      ? template.frames.cta
      : template.frames.point
}

/** Šablon važi za objavu istog formata (priča traži šablon 9:16). */
export function templateFits(
  template: FigmaTemplate | null | undefined,
  format: string,
): template is FigmaTemplate {
  return Boolean(template && template.format === format)
}
