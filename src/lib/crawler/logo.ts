import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'

import type { CrawlDeps, LogoCandidate } from './types'

export interface LogoResult {
  sourceUrl: string
  reason: string
  mimeType: string
  bytes: Buffer
  /** PNG render (za boje i pregled), uvek postoji */
  png: Buffer
  width: number
  height: number
  isSvg: boolean
}

/** Uklanja skripte, event handlere, strane reference i foreignObject iz SVG-a (brif 5.2). */
export function sanitizeSvg(svg: string): string {
  let out = svg
    .replace(/<\?xml-stylesheet[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!ENTITY[\s\S]*?>/gi, '')
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script[^>]*\/>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(xlink:href|href)\s*=\s*(?:"(?!#|data:image)[^"]*"|'(?!#|data:image)[^']*')/gi, '')
    .replace(
      /\s+style\s*=\s*(?:"[^"]*(?:expression|javascript|url\((?!\s*['"]?#))[^"]*"|'[^']*(?:expression|javascript|url\((?!\s*['"]?#))[^']*')/gi,
      '',
    )
  if (/<script|javascript:/i.test(out)) throw new Error('SVG sadrži skriptu.')
  if (!/<svg[\s>]/i.test(out)) throw new Error('Nije SVG.')
  out = out.trim()
  return out
}

function looksLikeSvg(buf: Buffer, contentType: string): boolean {
  if (contentType.includes('svg')) return true
  const head = buf.subarray(0, 512).toString('utf8').trim().toLowerCase()
  return head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))
}

/** Preuzima prvi upotrebljiv logo iz liste kandidata (po skoru). */
export async function fetchLogo(candidates: LogoCandidate[], deps: CrawlDeps): Promise<LogoResult | null> {
  const seen = new Set<string>()
  for (const c of candidates) {
    if (seen.has(c.src) || seen.size >= 6) continue
    seen.add(c.src)
    try {
      const res = await deps.fetch(c.src, {
        timeoutMs: 8_000,
        maxBytes: 5 * 1024 * 1024,
        headers: { accept: 'image/*,*/*;q=0.5' },
      })
      if (!res.ok || !res.body.length) continue
      if (looksLikeSvg(res.body, res.contentType)) {
        const svg = sanitizeSvg(res.body.toString('utf8'))
        const png = await sharp(Buffer.from(svg), { density: 192 })
          .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: false })
          .png()
          .toBuffer({ resolveWithObject: true })
        return {
          sourceUrl: c.src,
          reason: c.reason,
          mimeType: 'image/svg+xml',
          bytes: Buffer.from(svg),
          png: png.data,
          width: png.info.width,
          height: png.info.height,
          isSvg: true,
        }
      }
      const type = await fileTypeFromBuffer(res.body)
      if (!type || !/^image\/(png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon|avif)$/.test(type.mime)) continue
      let image = sharp(res.body, { limitInputPixels: 30_000_000, animated: false })
      const meta = await image.metadata()
      if (!meta.width || !meta.height) continue
      if (meta.width < 48 || meta.height < 16) continue
      if (meta.width > 1600 || meta.height > 1600)
        image = image.resize({ width: 1600, height: 1600, fit: 'inside' })
      const png = await image.png().toBuffer({ resolveWithObject: true })
      return {
        sourceUrl: c.src,
        reason: c.reason,
        mimeType:
          type.mime === 'image/x-icon' || type.mime === 'image/vnd.microsoft.icon' ? 'image/png' : type.mime,
        bytes: type.mime === 'image/x-icon' || type.mime === 'image/vnd.microsoft.icon' ? png.data : res.body,
        png: png.data,
        width: png.info.width,
        height: png.info.height,
        isSvg: false,
      }
    } catch {
      continue
    }
  }
  return null
}
