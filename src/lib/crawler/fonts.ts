/** Fontovi sajta (brif 5.2): Google Fonts linkovi, @font-face, font-family na body i naslovima; mapiranje na najbliži Google Font za šablone. */
export interface FontInfo {
  headings: string | null
  body: string | null
  googleFonts: string[]
  detected: string[]
  mappedHeadings: string
  mappedBody: string
}

const GOOGLE_FONTS = new Set(
  [
    'Inter',
    'Roboto',
    'Open Sans',
    'Lato',
    'Montserrat',
    'Poppins',
    'Raleway',
    'Nunito',
    'Nunito Sans',
    'Oswald',
    'Source Sans 3',
    'Source Sans Pro',
    'Playfair Display',
    'Merriweather',
    'Lora',
    'PT Sans',
    'PT Serif',
    'Ubuntu',
    'Rubik',
    'Work Sans',
    'Mulish',
    'Manrope',
    'DM Sans',
    'DM Serif Display',
    'Karla',
    'Quicksand',
    'Josefin Sans',
    'Barlow',
    'Fira Sans',
    'Noto Sans',
    'Noto Serif',
    'IBM Plex Sans',
    'IBM Plex Serif',
    'Space Grotesk',
    'Outfit',
    'Plus Jakarta Sans',
    'Figtree',
    'Sora',
    'Urbanist',
    'Lexend',
    'Cabin',
    'Exo 2',
    'Titillium Web',
    'Archivo',
    'Libre Baskerville',
    'Libre Franklin',
    'Crimson Text',
    'EB Garamond',
    'Cormorant Garamond',
    'Bebas Neue',
    'Anton',
    'Dancing Script',
    'Pacifico',
    'Caveat',
    'Geist',
    'Geist Mono',
    'JetBrains Mono',
    'Roboto Mono',
  ].map((f) => f.toLowerCase()),
)

const COMMERCIAL_MAP: Array<[RegExp, string]> = [
  [
    /helvetica|arial|system-ui|-apple-system|segoe ui|san francisco|sf pro|blinkmacsystemfont|verdana|tahoma/i,
    'Inter',
  ],
  [/georgia|times|garamond|baskerville|minion|caslon|cambria|book antiqua/i, 'Lora'],
  [
    /proxima nova|gotham|avenir|futura|brandon|gilroy|circular|graphik|aktiv grotesk|neue haas|akzidenz/i,
    'Montserrat',
  ],
  [/din|univers|frutiger|myriad|calibri|trebuchet|franklin gothic/i, 'Work Sans'],
  [/courier|consolas|menlo|monaco|monospace/i, 'JetBrains Mono'],
]

const GENERIC =
  /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|inherit|initial|unset)$/i

export function titleCaseFont(name: string): string {
  return name
    .replace(/[+_]/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ')
}

export function firstFamily(value: string): string | null {
  for (const part of value.split(',')) {
    const fam = part
      .replace(/['"]/g, '')
      .replace(/!important/i, '')
      .trim()
    if (!fam || GENERIC.test(fam) || /^var\(/.test(fam)) continue
    return titleCaseFont(fam)
  }
  return null
}

export function mapToGoogleFont(name: string | null, fallback: string): string {
  if (!name) return fallback
  if (GOOGLE_FONTS.has(name.toLowerCase())) return name
  for (const [re, target] of COMMERCIAL_MAP) if (re.test(name)) return target
  return fallback
}

export function googleFontsFromUrls(urls: string[]): string[] {
  const out = new Set<string>()
  for (const raw of urls) {
    if (!/fonts\.googleapis\.com/.test(raw)) continue
    try {
      const u = new URL(raw)
      for (const fam of u.searchParams.getAll('family')) {
        for (const part of fam.split('|')) {
          const name = part.split(':')[0]!.replace(/\+/g, ' ').trim()
          if (name) out.add(titleCaseFont(name))
        }
      }
    } catch {
      // ignoriši
    }
  }
  return [...out]
}

export function extractFonts(stylesheetUrls: string[], css: string): FontInfo {
  const googleFonts = googleFontsFromUrls(stylesheetUrls)
  const detected = new Set<string>(googleFonts)
  for (const m of css.matchAll(/@font-face\s*{[^}]*font-family\s*:\s*([^;}]+)/gi)) {
    const fam = firstFamily(m[1]!)
    if (fam) detected.add(fam)
  }
  let body: string | null = null
  let headings: string | null = null
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}')
  for (const rule of rules) {
    const [selector = '', decls = ''] = rule.split('{')
    const m = /font-family\s*:\s*([^;}]+)/i.exec(decls)
    if (!m) continue
    const fam = firstFamily(m[1]!)
    if (!fam) continue
    detected.add(fam)
    if (!body && /(^|[\s,])(html|body|:root|p)(\s|,|$|\.|#)/i.test(selector)) body = fam
    if (!headings && /(^|[\s,])(h1|h2|h3|\.title|\.heading|\.headline)(\s|,|$|\.|#)/i.test(selector))
      headings = fam
  }
  if (!body && googleFonts[0]) body = googleFonts[0]
  if (!headings) headings = googleFonts[1] ?? googleFonts[0] ?? body
  return {
    headings,
    body,
    googleFonts,
    detected: [...detected].slice(0, 12),
    mappedHeadings: mapToGoogleFont(headings, 'Inter'),
    mappedBody: mapToGoogleFont(body, 'Inter'),
  }
}
