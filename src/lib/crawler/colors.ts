/**
 * Boje brenda iz CSS-a i logoa (brif 5.2): parsiranje, uklanjanje neutralnih,
 * spajanje sličnih (ΔE76), rangiranje, WCAG kontrast. Čiste funkcije.
 */
export interface ColorWeight {
  hex: string
  weight: number
  source: string
}

export interface Palette {
  primary: string
  secondary: string
  accent: string
  neutralLight: string
  neutralDark: string
  textOnLight: string
  textOnDark: string
  isMonochrome: boolean
  candidates: Array<{ hex: string; weight: number }>
  contrast: { primaryOnWhite: number; primaryOnDark: number; textOnPrimary: string }
}

const HEX_RE = /#([0-9a-f]{3,8})\b/gi
const RGB_RE = /rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*[\d.]+%?)?\s*\)/gi
const HSL_RE =
  /hsla?\(\s*([\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%(?:\s*[,/]\s*[\d.]+%?)?\s*\)/gi

export function normalizeHex(input: string): string | null {
  const m = /^#?([0-9a-f]{3,8})$/i.exec(input.trim())
  if (!m) return null
  let h = m[1]!.toLowerCase()
  if (h.length === 3 || h.length === 4)
    h = h
      .slice(0, 3)
      .split('')
      .map((c) => c + c)
      .join('')
  if (h.length === 8) h = h.slice(0, 6)
  if (h.length !== 6) return null
  return `#${h}`
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? '#000000'
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100
  const light = l / 100
  const c = (1 - Math.abs(2 * light - 1)) * sat
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = light - c / 2
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  return { h, s, l }
}

function toLab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92
  }) as [number, number, number]
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

/** ΔE76 u Lab prostoru. */
export function colorDistance(a: string, b: string): number {
  const [l1, a1, b1] = toLab(a)
  const [l2, a2, b2] = toLab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG kontrast (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [light, dark] = la > lb ? [la, lb] : [lb, la]
  return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100
}

/** Gotovo bele, crne i sive boje se ne računaju kao boje brenda. */
export function isNeutral(hex: string): boolean {
  const { s, l } = hexToHsl(hex)
  return s < 0.12 || l > 0.95 || l < 0.07
}

export function parseColorToken(token: string): string | null {
  const t = token.trim()
  const hex = normalizeHex(t)
  if (hex) return hex
  const rgb = new RegExp(RGB_RE.source, 'i').exec(t)
  if (rgb) return rgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]))
  const hsl = new RegExp(HSL_RE.source, 'i').exec(t)
  if (hsl) return hslToHex(Number(hsl[1]) % 360, Number(hsl[2]), Number(hsl[3]))
  return null
}

const BRAND_VAR = /(primary|brand|accent|main|theme|secondary)/i
const IMPORTANT_SELECTOR = /(button|\.btn|header|\.nav|\.navbar|\.cta|\.hero|a\b|\.link|\.badge|\.primary)/i

/** Boje iz CSS-a sa težinama: custom properties i važni selektori teže. */
export function parseCssColors(css: string, baseWeight = 1, source = 'css'): ColorWeight[] {
  const out: ColorWeight[] = []
  const push = (hex: string | null, weight: number) => {
    if (hex) out.push({ hex, weight: weight * baseWeight, source })
  }
  // custom properties
  for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
    const hex = parseColorToken(m[2]!)
    if (hex) push(hex, BRAND_VAR.test(m[1]!) ? 8 : 4)
  }
  // pravila: selektor { deklaracije }
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}')
  for (const rule of rules) {
    const [selector = '', decls = ''] = rule.split('{')
    if (!decls) continue
    const weight = IMPORTANT_SELECTOR.test(selector) ? 3 : 1
    for (const m of decls.matchAll(
      /(?:^|;)\s*(color|background(?:-color)?|border(?:-[a-z]+)?-color|fill|stroke)\s*:\s*([^;!]+)/gi,
    )) {
      const value = m[2]!
      for (const tok of [...value.matchAll(HEX_RE)].map((x) => x[0])) push(normalizeHex(tok), weight)
      for (const tok of [...value.matchAll(RGB_RE)].map((x) => x[0])) push(parseColorToken(tok), weight)
      for (const tok of [...value.matchAll(HSL_RE)].map((x) => x[0])) push(parseColorToken(tok), weight)
    }
  }
  return out
}

/**
 * Spaja slične boje (ΔE < threshold) sabirajući težine. Predstavnik klastera je najteža
 * tačna boja (CSS, theme-color); boje iz logoa su kvantizovane pa predstavljaju klaster
 * samo kad nema tačne.
 */
export function mergeSimilar(colors: ColorWeight[], threshold = 12): Array<{ hex: string; weight: number }> {
  const exact = (c: ColorWeight) => c.source !== 'logo'
  const clusters: Array<{ hex: string; hexExact: boolean; weight: number }> = []
  for (const c of [...colors].sort((a, b) => b.weight - a.weight)) {
    const hit = clusters.find((k) => colorDistance(k.hex, c.hex) < threshold)
    if (hit) {
      hit.weight += c.weight
      if (!hit.hexExact && exact(c)) {
        hit.hex = c.hex
        hit.hexExact = true
      }
    } else clusters.push({ hex: c.hex, hexExact: exact(c), weight: c.weight })
  }
  return clusters.sort((a, b) => b.weight - a.weight).map(({ hex, weight }) => ({ hex, weight }))
}

function adjustLightness(hex: string, delta: number): string {
  const { h, s, l } = hexToHsl(hex)
  return hslToHex(h, s * 100, Math.max(0, Math.min(100, (l + delta) * 100)))
}

function hueDiff(a: string, b: string): number {
  const d = Math.abs(hexToHsl(a).h - hexToHsl(b).h)
  return Math.min(d, 360 - d)
}

/** Sastavlja paletu brenda iz svih izvora (CSS, theme-color, logo). */
export function buildPalette(input: {
  css: ColorWeight[]
  logo: ColorWeight[]
  themeColor?: string | null
}): Palette {
  const all: ColorWeight[] = [...input.css, ...input.logo.map((c) => ({ ...c, weight: c.weight * 4 }))]
  const theme = input.themeColor ? parseColorToken(input.themeColor) : null
  if (theme) all.push({ hex: theme, weight: 6, source: 'theme-color' })

  const chromatic = mergeSimilar(all.filter((c) => !isNeutral(c.hex)))
  const neutrals = mergeSimilar(
    all.filter((c) => isNeutral(c.hex)),
    8,
  )

  const isMonochrome = chromatic.length === 0
  const primary = chromatic[0]?.hex ?? neutrals.find((n) => hexToHsl(n.hex).l < 0.4)?.hex ?? '#1f2937'
  const secondary =
    chromatic.find((c) => c.hex !== primary && colorDistance(c.hex, primary) > 20)?.hex ??
    adjustLightness(primary, -0.18)
  const accent =
    chromatic.find((c) => c.hex !== primary && c.hex !== secondary && hueDiff(c.hex, primary) > 40)?.hex ??
    adjustLightness(primary, 0.2)

  const neutralLight = neutrals.find((n) => hexToHsl(n.hex).l > 0.9)?.hex ?? '#f8fafc'
  const neutralDark = neutrals.find((n) => hexToHsl(n.hex).l < 0.2)?.hex ?? '#111827'
  const textOnLight = contrastRatio('#111827', neutralLight) >= 4.5 ? '#111827' : '#000000'
  const textOnDark = contrastRatio('#ffffff', neutralDark) >= 4.5 ? '#ffffff' : '#f8fafc'
  const textOnPrimary =
    contrastRatio('#ffffff', primary) >= contrastRatio('#111827', primary) ? '#ffffff' : '#111827'

  return {
    primary,
    secondary,
    accent,
    neutralLight,
    neutralDark,
    textOnLight,
    textOnDark,
    isMonochrome,
    candidates: chromatic.slice(0, 8),
    contrast: {
      primaryOnWhite: contrastRatio(primary, '#ffffff'),
      primaryOnDark: contrastRatio(primary, neutralDark),
      textOnPrimary,
    },
  }
}
