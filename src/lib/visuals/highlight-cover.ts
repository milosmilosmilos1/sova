import 'server-only'

import sharp from 'sharp'

import type { HighlightIcon } from '@/lib/ai/prompts/profile-highlights'
import { mix, readable } from '@/lib/visuals/design/kit'
import { HIGHLIGHT_ICON_NODES } from '@/lib/visuals/highlight-icons'

/**
 * Naslovna za Instagram highlight (D-144): kadar priče 1080×1920 u boji brenda, sa ikonicom u sredini.
 * Instagram pri izboru naslovne seče krug iz sredine kadra, pa je ikonica unutar kruga od 800 px.
 */
export const HIGHLIGHT_COVER = { width: 1080, height: 1920 } as const

const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** Elementi ikonice kao SVG, bez spoljnog `<svg>` taga. */
function iconMarkup(icon: HighlightIcon): string {
  return HIGHLIGHT_ICON_NODES[icon]
    .map(
      ([tag, attrs]) =>
        `<${tag} ${Object.entries(attrs)
          .map(([k, v]) => `${k}="${attr(v)}"`)
          .join(' ')}/>`,
    )
    .join('')
}

const HEX = /^#[0-9a-fA-F]{6}$/

export function highlightCoverSvg(input: { icon: HighlightIcon; primary: string }): string {
  const primary = HEX.test(input.primary) ? input.primary : '#2563EB'
  const deep = mix(primary, '#000000', 0.22)
  const ink = readable(primary)
  const { width, height } = HIGHLIGHT_COVER
  const size = 400
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">',
    `<stop offset="0" stop-color="${primary}"/><stop offset="1" stop-color="${deep}"/>`,
    '</linearGradient></defs>',
    `<rect width="${width}" height="${height}" fill="url(#bg)"/>`,
    `<circle cx="${width / 2}" cy="${height / 2}" r="400" fill="${ink}" fill-opacity="0.12"/>`,
    `<svg x="${(width - size) / 2}" y="${(height - size) / 2}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" color="${ink}" stroke="${ink}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">`,
    iconMarkup(input.icon),
    '</svg>',
    '</svg>',
  ].join('')
}

export async function renderHighlightCover(input: { icon: HighlightIcon; primary: string }): Promise<Buffer> {
  return sharp(Buffer.from(highlightCoverSvg(input)))
    .png()
    .toBuffer()
}
