import { Vibrant } from 'node-vibrant/node'

import { logger } from '@/lib/logger'

import { buildPalette, parseCssColors, type ColorWeight, type Palette } from './colors'
import { extractFonts, type FontInfo } from './fonts'
import { fetchLogo, type LogoResult } from './logo'
import type { CrawlDeps, ExtractedPage } from './types'

/**
 * Vizuelni identitet sa početne strane (brif 5.2): boje iz CSS-a (unutrašnjeg i do tri lista
 * stilova), `theme-color` i boje loga, plus fontovi mapirani na Google fontove. Koriste ga analiza
 * brenda i izbor izgleda (D-123). Greška pojedinačnog lista stilova ili loga se preskače.
 */
export async function readVisual(
  home: Pick<ExtractedPage, 'url' | 'stylesheets' | 'inlineCss' | 'themeColor' | 'logoCandidates'>,
  deps: CrawlDeps,
): Promise<{ palette: Palette; fonts: FontInfo; logo: LogoResult | null }> {
  const cssColors: ColorWeight[] = parseCssColors(home.inlineCss, 1.5, 'inline')
  const sheets = home.stylesheets
    .filter((u) => !/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(u))
    .slice(0, 3)
  const loaded = await Promise.all(
    sheets.map(async (sheetUrl) => {
      try {
        const res = await deps.fetch(sheetUrl, {
          timeoutMs: 8_000,
          maxBytes: 768 * 1024,
          headers: { accept: 'text/css,*/*;q=0.1' },
        })
        if (!res.ok || res.contentType.includes('text/html')) return null
        return { url: sheetUrl, css: res.body.toString('utf8') }
      } catch {
        return null
      }
    }),
  )
  let allCss = home.inlineCss
  for (const sheet of loaded) {
    if (!sheet) continue
    allCss += `\n${sheet.css}`
    cssColors.push(...parseCssColors(sheet.css, 1, sheet.url))
  }

  const logoColors: ColorWeight[] = []
  const logo = await fetchLogo(home.logoCandidates, deps)
  if (logo) {
    try {
      const palette = await Vibrant.from(logo.png).getPalette()
      for (const [name, swatch] of Object.entries(palette)) {
        if (!swatch) continue
        const weight =
          Math.max(1, Math.log2(1 + swatch.population)) *
          (name === 'Vibrant' ? 2 : name === 'DarkVibrant' || name === 'LightVibrant' ? 1.3 : 0.6)
        logoColors.push({ hex: swatch.hex, weight, source: 'logo' })
      }
    } catch (error) {
      logger.warn('logo_palette_failed', { url: home.url, error })
    }
  }

  return {
    palette: buildPalette({ css: cssColors, logo: logoColors, themeColor: home.themeColor }),
    fonts: extractFonts(home.stylesheets, allCss),
    logo,
  }
}
