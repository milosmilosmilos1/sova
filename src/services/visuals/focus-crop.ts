import 'server-only'

import sharp from 'sharp'

import { focusCrop, type Focus } from '@/lib/visuals/focus'

/**
 * Isečak fotografije sa Unsplash-a i Pexels-a za vrstu objave (D-167): kvadrat staje na svaku mrežu,
 * 9:16 je za priču. Isečak ide oko glavnog predmeta koji je provera fotografija našla, umesto po
 * sredini, pa pas ili proizvod ne ostanu odsečeni uz ivicu.
 */
export const STOCK_CROPS = {
  square: { w: 1600, h: 1600 },
  portrait: { w: 1080, h: 1920 },
} as const
export type StockCrop = keyof typeof STOCK_CROPS

/**
 * Najmanja veličina za preuzimanje da isečak bude pun: po visini kad je fotografija šira od isečka,
 * inače po širini. Druga strana prati odnos stranica originala.
 */
export function stockFetchSize(width: number, height: number, crop: StockCrop): { w?: number; h?: number } {
  const t = STOCK_CROPS[crop]
  if (!width || !height) return { w: t.w }
  return width / height > t.w / t.h ? { h: t.h } : { w: t.w }
}

/** Isečak oko fokusa u veličini vrste objave (bez fokusa po sredini); vraća JPEG i fokus u isečku. */
export async function cropAroundFocus(
  bytes: Buffer,
  crop: StockCrop,
  focus: Focus | null,
): Promise<{ bytes: Buffer; focus: Focus | null }> {
  const t = STOCK_CROPS[crop]
  const raw = await sharp(bytes, { limitInputPixels: 80_000_000 })
    .rotate()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height, channels } = raw.info
  const rect = focusCrop(width, height, t.w / t.h, focus ?? { x: 0.5, y: 0.5 })
  const out = await sharp(raw.data, { raw: { width, height, channels } })
    .extract({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    .resize(t.w, t.h)
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer()
  return { bytes: out, focus: focus ? rect.focus : null }
}
