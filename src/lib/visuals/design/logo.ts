import sharp from 'sharp'

import { toDataUri } from '../render'
import { ICON_MAX_ASPECT } from '@/lib/brands/swatch'

import { contrast } from './kit'
import type { BrandLogo } from './types'

/**
 * Logo za slajd (D-134): bez praznih ivica i bez ravne pozadine (bela iza natpisa), u bojama brenda
 * i jednobojno (belo i tamno), uz udeo tamnog i svetlog dela. Slajd po tome bira verziju koja se
 * vidi na svojoj podlozi, a veličinu po obliku (širok natpis i kvadratni znak jednako krupni).
 */

const MAX_HEIGHT = 240
const DARK_INK = { r: 17, g: 24, b: 39 }

const dist = (data: Uint8Array, i: number, bg: [number, number, number]) =>
  Math.hypot(data[i]! - bg[0], data[i + 1]! - bg[1], data[i + 2]! - bg[2])

/**
 * Ravna pozadina: cela neprovidna slika čiji je okvir skoro jedne boje. Fotografija ili logo preko
 * ivice nemaju takav okvir, pa ostaju kakvi jesu.
 */
function flatBackground(data: Uint8Array, width: number, height: number): [number, number, number] | null {
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 250) return null
  const ring: number[] = []
  for (let x = 0; x < width; x++) ring.push(x, (height - 1) * width + x)
  for (let y = 1; y < height - 1; y++) ring.push(y * width, y * width + width - 1)
  const median = (k: number) => {
    const values = ring.map((p) => data[p * 4 + k]!).sort((a, b) => a - b)
    return values[values.length >> 1]!
  }
  const bg: [number, number, number] = [median(0), median(1), median(2)]
  const close = ring.filter((p) => dist(data, p * 4, bg) < 24).length
  return close / ring.length >= 0.92 ? bg : null
}

/**
 * Pozadina postaje providna po boji (i u slovima „o”, „e”: rupe u natpisu), sa mekim prelazom na
 * ivicama; boja delimično providnog piksela se oslobađa pozadine da ne ostane svetao obod.
 */
function knockOut(data: Uint8Array, bg: [number, number, number]): void {
  const from = 18
  const to = 90
  for (let i = 0; i < data.length; i += 4) {
    const d = dist(data, i, bg)
    if (d >= to) continue
    const a = Math.max(0, (d - from) / (to - from))
    if (a === 0) {
      data[i + 3] = 0
      continue
    }
    for (let k = 0; k < 3; k++)
      data[i + k] = Math.round(Math.min(255, Math.max(0, bg[k]! + (data[i + k]! - bg[k]!) / a)))
    data[i + 3] = Math.round(255 * a)
  }
}

/** Okvir vidljivog dela logoa (providne ivice napolje); prazan logo daje `null`. */
function inkBounds(data: Uint8Array, width: number, height: number) {
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3]! > 10) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
  return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 }
}

/** Isti oblik u jednoj boji: providnost ostaje, boja se menja. */
function tinted(data: Uint8Array, color: { r: number; g: number; b: number }): Uint8Array {
  const out = new Uint8Array(data)
  for (let i = 0; i < out.length; i += 4) {
    out[i] = color.r
    out[i + 1] = color.g
    out[i + 2] = color.b
  }
  return out
}

async function png(data: Uint8Array, width: number, height: number): Promise<string> {
  const bytes = await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer()
  return toDataUri(bytes, 'image/png')
}

export async function prepareBrandLogo(bytes: Buffer, mimeType: string): Promise<BrandLogo | null> {
  const source =
    mimeType === 'image/svg+xml'
      ? sharp(bytes, { density: 192 })
      : sharp(bytes, { limitInputPixels: 30_000_000 }).rotate()
  const raw = await source
    .resize({ width: 1600, height: 480, fit: 'inside', withoutEnlargement: mimeType !== 'image/svg+xml' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const data = new Uint8Array(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength).slice()
  const { width, height } = raw.info
  const bg = flatBackground(data, width, height)
  if (bg) knockOut(data, bg)
  const box = inkBounds(data, width, height)
  if (!box) return null

  // isečen logo, najviše 240 px visine (slajd ga ne crta većeg)
  const cut = await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
    raw: { width, height, channels: 4 },
  })
    .extract(box)
    .resize({ height: Math.min(MAX_HEIGHT, box.height), width: 960, fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const ink = new Uint8Array(cut.data.buffer, cut.data.byteOffset, cut.data.byteLength)
  const w = cut.info.width
  const h = cut.info.height
  const [src, white, darkVersion] = await Promise.all([
    png(ink, w, h),
    png(tinted(ink, { r: 255, g: 255, b: 255 }), w, h),
    png(tinted(ink, DARK_INK), w, h),
  ])
  return {
    src,
    light: white,
    dark: darkVersion,
    aspect: w / h,
    inks: inkColors(ink),
    tile: isTile(ink, w, h),
  }
}

/**
 * Pločica (D-153): znak stoji unutar neprovidne pozadine, bez providnog razmaka oko sebe. Broje se
 * granice dve različite boje unutar neprovidnog dela (cifre na pločici) i granice prema providnom
 * (obris slova natpisa). Kod natpisa preovlađuje obris, pa jednobojna verzija čuva oblik; kod pločice
 * preovlađuju unutrašnje granice, a jednobojna verzija bi bila prazan kvadrat.
 */
function isTile(data: Uint8Array, width: number, height: number): boolean {
  const opaque = (i: number) => data[i + 3]! > 200
  let inner = 0
  let outline = 0
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (!opaque(i)) continue
      for (const j of [x + 1 < width ? i + 4 : -1, y + 1 < height ? i + width * 4 : -1]) {
        if (j < 0) continue
        if (!opaque(j)) outline++
        else if (dist(data, i, [data[j]!, data[j + 1]!, data[j + 2]!]) > 80) inner++
      }
    }
  return inner > 40 && inner >= outline * 0.5
}

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase()

/**
 * Glavne boje logoa (vidljivi pikseli, grubo po 32 nijanse kanala), slične spojene, do četiri, sa
 * udelom. Obod slova (polu-providan) se ne broji.
 */
function inkColors(data: Uint8Array): Array<{ color: string; share: number }> {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  let total = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 200) continue
    const key = ((data[i]! >> 5) << 6) | ((data[i + 1]! >> 5) << 3) | (data[i + 2]! >> 5)
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    bucket.n++
    bucket.r += data[i]!
    bucket.g += data[i + 1]!
    bucket.b += data[i + 2]!
    buckets.set(key, bucket)
    total++
  }
  if (!total) return []
  const groups: Array<{ n: number; r: number; g: number; b: number }> = []
  for (const bucket of [...buckets.values()].sort((a, b) => b.n - a.n)) {
    const mean = [bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n]
    const near = groups.find(
      (g) => Math.hypot(g.r / g.n - mean[0]!, g.g / g.n - mean[1]!, g.b / g.n - mean[2]!) < 48,
    )
    if (near) {
      near.n += bucket.n
      near.r += bucket.r
      near.g += bucket.g
      near.b += bucket.b
    } else groups.push({ ...bucket })
  }
  return groups
    .sort((a, b) => b.n - a.n)
    .slice(0, 4)
    .map((g) => ({ color: hex(g.r / g.n, g.g / g.n, g.b / g.n), share: g.n / total }))
}

/**
 * Znak brenda u aplikaciji (D-155): kvadratan logo kao PNG ikonica. Pločica ide preko cele ikonice,
 * a znak bez pozadine stoji na beloj ili tamnoj podlozi, kojoj god je kontrast sa bojom znaka veći.
 * Širok natpis na 20 px nije čitljiv, pa vraća `null` (aplikacija tada crta početno slovo).
 */
export async function brandIconPng(logo: BrandLogo, size = 96): Promise<Buffer | null> {
  if (logo.aspect > ICON_MAX_ASPECT || logo.aspect < 1 / ICON_MAX_ASPECT) return null
  const bytes = Buffer.from(logo.src.split(',')[1] ?? '', 'base64')
  if (logo.tile) return sharp(bytes).resize(size, size, { fit: 'cover' }).png().toBuffer()
  const ink = logo.inks[0]?.color ?? '#111827'
  const background = contrast(ink, '#FFFFFF') >= contrast(ink, '#0F172A') ? '#FFFFFF' : '#0F172A'
  const inner = Math.round(size * 0.76)
  const mark = await sharp(bytes)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toBuffer()
}
