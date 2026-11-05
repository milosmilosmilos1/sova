import 'server-only'

import { randomBytes } from 'node:crypto'

import satori from 'satori'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { logger } from '@/lib/logger'
import {
  CUSTOM_FONT_MAX_BYTES,
  CUSTOM_FONTS_MAX,
  type CustomFont,
  type StoredDesign,
} from '@/lib/schemas/design'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import {
  CUSTOM_FONT_BUCKET,
  customFontPath,
  fontFormat,
  forgetFont,
  googleFontExists,
} from '@/lib/visuals/fonts'
import { getBrand } from '@/services/brands'
import { storedDesign } from '@/services/design/brand-design'
import type { Json } from '@/types/database'

/**
 * Sopstveni font brenda (D-159): korisnik otpremi TTF, OTF ili WOFF, Sova proveri da ga crtač slajdova
 * čita i sačuva ga u skladištu `brand-assets` pod porodicom „Custom <id>”. Font se bira kao i Google
 * font i važi u svim stilovima. WOFF2 crtač ne čita, pa se odbija sa uputstvom.
 */
async function saveCustomFonts(brandId: string, design: StoredDesign): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from('brands')
    .update({ design: design as unknown as Json })
    .eq('id', brandId)
  if (error) throw mapDbError(error)
}

/** Crtač slajdova mora da pročita font i nacrta latinicu sa kvačicama. */
async function readable(data: ArrayBuffer): Promise<boolean> {
  try {
    const probe = {
      type: 'div',
      props: { style: { fontFamily: 'Probni', fontSize: 32 }, children: 'Aa Šđčć 24' },
    }
    await satori(probe as unknown as Parameters<typeof satori>[0], {
      width: 200,
      height: 60,
      fonts: [{ name: 'Probni', data, weight: 400, style: 'normal' }],
    })
    return true
  } catch {
    return false
  }
}

export async function uploadCustomFont(
  viewer: Viewer,
  brandId: string,
  input: { name: string; data: string },
): Promise<CustomFont> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const stored = storedDesign(brand)
  const list = stored.customFonts ?? []
  if (list.length >= CUSTOM_FONTS_MAX)
    throw new ApiError('VALIDATION', `Brend može da ima najviše ${CUSTOM_FONTS_MAX} sopstvenih fontova.`)
  const bytes = Buffer.from(input.data, 'base64')
  if (bytes.byteLength > CUSTOM_FONT_MAX_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE')
  const format = fontFormat(bytes)
  if (format === 'woff2')
    throw new ApiError(
      'VALIDATION',
      'Font u formatu WOFF2 Sova ne može da crta. Pošaljite TTF, OTF ili WOFF.',
    )
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  if (!format || !(await readable(data)))
    throw new ApiError('VALIDATION', 'Fajl nije font koji Sova može da pročita. Pošaljite TTF, OTF ili WOFF.')

  const id = randomBytes(9).toString('hex').slice(0, 12)
  const family = `Custom ${id}`
  const { error } = await createSupabaseAdminClient()
    .storage.from(CUSTOM_FONT_BUCKET)
    // OTF je isti OpenType kontejner kao TTF; skladište prima samo font/ttf i font/woff
    .upload(customFontPath(id), bytes, { contentType: format === 'woff' ? 'font/woff' : 'font/ttf' })
  if (error) {
    logger.warn('custom_font_upload_failed', { brandId, error: error.message })
    throw new ApiError('INTERNAL', 'Font nije sačuvan. Pokušajte ponovo.')
  }
  const font: CustomFont = { family, name: input.name.trim(), format }
  await saveCustomFonts(brand.id, { ...stored, customFonts: [...list, font] })
  return font
}

/** Brisanje sopstvenog fonta; izgled koji ga koristi vraća fontove sa sajta. */
export async function removeCustomFont(viewer: Viewer, brandId: string, family: string): Promise<void> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const stored = storedDesign(brand)
  const list = stored.customFonts ?? []
  if (!list.some((f) => f.family === family)) throw new ApiError('NOT_FOUND', 'Font ne postoji.')
  const next: StoredDesign = { ...stored, customFonts: list.filter((f) => f.family !== family) }
  if (stored.fonts && (stored.fonts.headings === family || stored.fonts.body === family)) delete next.fonts
  await saveCustomFonts(brand.id, next)
  await createSupabaseAdminClient()
    .storage.from(CUSTOM_FONT_BUCKET)
    .remove([customFontPath(family.slice('Custom '.length))])
  forgetFont(family)
}

/** Bilo koji Google font po imenu (D-159); Sova ga preuzme da proveri da postoji. */
export async function checkGoogleFont(family: string): Promise<{ family: string; found: boolean }> {
  return { family, found: await googleFontExists(family) }
}
