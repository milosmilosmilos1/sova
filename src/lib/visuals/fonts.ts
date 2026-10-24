import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Fontovi za Satori render: Google Font brenda (TTF/WOFF kroz CSS v1 API sa starim User-Agentom)
 * sa kešom u memoriji, plus ugrađeni Inter (OFL) kao fallback za glifove kojih nema u fontu brenda.
 * Satori ne čita WOFF2, zato se traži ttf/woff; ugrađeni Inter je WOFF podskup (latinica, latin-ext, ćirilica) sa Google Fonts, OFL licenca.
 */
export interface FontEntry {
  name: string
  data: ArrayBuffer
  weight: 400 | 700
  style: 'normal'
}

export const BUNDLED_FAMILY = 'Inter'
const FONT_DIR = path.join(process.cwd(), 'src', 'lib', 'visuals', 'fonts')
/** Stari Chrome dobija WOFF (IE6 bi dobio EOT, a moderni UA WOFF2 koji Satori ne čita). */
const LEGACY_UA =
  'Mozilla/5.0 (Windows NT 5.1) AppleWebKit/534.30 (KHTML, like Gecko) Chrome/12.0.742.100 Safari/534.30'

let remoteEnabled = true
const cache = new Map<string, Promise<FontEntry | null>>()

/** Testovi isključuju mrežu: koristi se samo ugrađeni Inter. */
export function configureFontLoader(options: { remote: boolean }): void {
  remoteEnabled = options.remote
}

export function resetFontCacheForTests(): void {
  cache.clear()
}

async function bundled(weight: 400 | 700): Promise<FontEntry> {
  const buf = await readFile(path.join(FONT_DIR, `Inter-${weight}.woff`))
  return {
    name: BUNDLED_FAMILY,
    data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    weight,
    style: 'normal',
  }
}

async function fetchGoogle(family: string, weight: 400 | 700): Promise<FontEntry | null> {
  const url = `https://fonts.googleapis.com/css?family=${encodeURIComponent(family).replace(/%20/g, '+')}:${weight}&subset=latin,latin-ext,cyrillic`
  try {
    const css = await (
      await fetch(url, { headers: { 'user-agent': LEGACY_UA }, signal: AbortSignal.timeout(8_000) })
    ).text()
    const m = /url\((https:\/\/fonts\.gstatic\.com[^)'"]+)\)/.exec(css)
    if (!m) return null
    const res = await fetch(m[1]!, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    const data = await res.arrayBuffer()
    if (data.byteLength < 1000 || data.byteLength > 3_000_000) return null
    const magic = Buffer.from(data.slice(0, 4))
    const ok =
      magic.toString('latin1') === 'wOFF' ||
      magic.toString('latin1') === 'OTTO' ||
      magic.readUInt32BE(0) === 0x00010000
    if (!ok) return null
    return { name: family, data, weight, style: 'normal' }
  } catch {
    return null
  }
}

function load(family: string, weight: 400 | 700): Promise<FontEntry | null> {
  const key = `${family.toLowerCase()}:${weight}`
  let p = cache.get(key)
  if (!p) {
    p =
      family === BUNDLED_FAMILY
        ? bundled(weight)
        : remoteEnabled
          ? fetchGoogle(family, weight)
          : Promise.resolve(null)
    cache.set(key, p)
    p.then((v) => {
      if (!v) cache.delete(key)
    }).catch(() => cache.delete(key))
  }
  return p
}

/**
 * Učitava fontove za zadate porodice (400 i 700) i uvek dodaje Inter na kraj.
 * Vraća i mapu koja porodica je zaista dostupna, da šablon može da padne na Inter.
 */
export async function loadFonts(families: string[]): Promise<{ fonts: FontEntry[]; available: Set<string> }> {
  const wanted = [...new Set(families.filter(Boolean).filter((f) => f !== BUNDLED_FAMILY))]
  const fonts: FontEntry[] = []
  const available = new Set<string>([BUNDLED_FAMILY])
  for (const family of wanted) {
    const [regular, bold] = await Promise.all([load(family, 400), load(family, 700)])
    if (regular) fonts.push(regular)
    if (bold) fonts.push(bold)
    if (regular || bold) available.add(family)
  }
  fonts.push(await bundled(400), await bundled(700))
  return { fonts, available }
}
