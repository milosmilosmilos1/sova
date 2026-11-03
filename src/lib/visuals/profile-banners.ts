import 'server-only'

import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import sharp from 'sharp'

import { PROFILE_BANNERS, type BannerKind } from '@/config/profile-banners'

import { alpha, box, col, fit, img, logoBox, logoFor, mix, px, readable, text } from './design/kit'
import type { BrandLogo, DesignColors } from './design/types'
import { BUNDLED_FAMILY, loadFonts } from './fonts'
import type { SatoriNode } from './templates'

/** Crtanje naslovne slike profila (D-145); veličine i deo koji se vidi su u `config/profile-banners`. */
export interface BannerInput {
  kind: BannerKind
  /** za početna slova na profilnoj slici bez logoa */
  brandName: string
  colors: DesignColors
  fonts: { headings: string; body: string }
  title: string
  subtitle: string
  /** sajt ili nalog, u „dugmetu” ispod teksta */
  footer: string
  logo: BrandLogo | null
}

/** Početna slova imena za profilnu sliku bez logoa: „Pekara Zlatni klas” daje „PZ”. */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return (
    words
      .slice(0, 2)
      .map((w) => Array.from(w)[0]!.toLocaleUpperCase())
      .join('') || '?'
  )
}

/** Profilna slika (D-147): logo ili početna slova u sredini, na boji brenda. */
function avatarTree(input: BannerInput, fonts: { headings: string; body: string }): SatoriNode {
  const { width, height, safe } = PROFILE_BANNERS.avatar
  const primary = input.colors.primary
  const ink = readable(primary)
  let content: SatoriNode | null
  if (input.logo) {
    const fitted = logoBox(input.logo.aspect, safe.height * 0.42)
    // dugačak natpis ne sme da izađe iz kruga
    const scale = Math.min(1, (safe.width * 0.9) / fitted.width)
    content = img(logoFor(input.logo, ink, primary), {
      width: px(fitted.width * scale),
      height: px(fitted.height * scale),
    })
  } else {
    const letters = monogram(input.brandName)
    content = text(
      {
        fontFamily: fonts.headings,
        fontWeight: 700,
        fontSize: px(safe.height * (Array.from(letters).length > 1 ? 0.42 : 0.55)),
        lineHeight: 1,
        color: ink,
      },
      letters,
    )
  }
  return box(
    {
      position: 'relative',
      width: px(width),
      height: px(height),
      overflow: 'hidden',
      backgroundColor: primary,
      backgroundImage: `linear-gradient(135deg, ${primary} 0%, ${mix(primary, '#000000', 0.25)} 100%)`,
    },
    [
      col(
        {
          position: 'absolute',
          left: px(safe.x),
          top: px(safe.y),
          width: px(safe.width),
          height: px(safe.height),
          justifyContent: 'center',
          alignItems: 'center',
        },
        [content],
      ),
    ],
  )
}

/** Satori stablo naslovne; `fonts` su porodice koje su zaista učitane. */
export function bannerTree(input: BannerInput, fonts: { headings: string; body: string }): SatoriNode {
  if (input.kind === 'avatar') return avatarTree(input, fonts)
  const spec = PROFILE_BANNERS[input.kind]
  const { safe } = spec
  const primary = input.colors.primary
  const ink = readable(primary)
  const end = spec.align === 'end'
  const pad = safe.height * 0.06
  const inner = { width: safe.width - pad * 2, height: safe.height - pad * 2 }
  const title = input.title.trim()
  const subtitle = input.subtitle.trim()
  const footer = input.footer.trim()
  const gap = inner.height * 0.05

  const logo = input.logo ? logoBox(input.logo.aspect, inner.height * (title ? 0.2 : 0.3)) : null
  const titleSize = title
    ? fit(title, {
        max: inner.height * 0.3,
        min: inner.height * 0.12,
        width: inner.width,
        height: inner.height * 0.38,
        lineHeight: 1.05,
        charWidth: 0.6,
      })
    : 0
  const subtitleSize = subtitle
    ? fit(subtitle, {
        max: inner.height * 0.13,
        min: inner.height * 0.07,
        width: inner.width * 0.92,
        height: inner.height * 0.26,
        lineHeight: 1.3,
      })
    : 0
  // sajt ostaje čitljiv i na niskoj naslovnoj LinkedIn stranice
  const footerSize = Math.max(14, inner.height * 0.075)
  const textAlign = end ? 'right' : 'center'

  return box(
    {
      position: 'relative',
      width: px(spec.width),
      height: px(spec.height),
      overflow: 'hidden',
      backgroundColor: primary,
      backgroundImage: `linear-gradient(135deg, ${primary} 0%, ${mix(primary, '#000000', 0.25)} 100%)`,
    },
    [
      // ukrasi u visini dela koji se vidi: puni krug desno, prsten levo
      box({
        position: 'absolute',
        left: px(safe.x + safe.width - safe.height * 0.55),
        top: px(safe.y - safe.height * 0.6),
        width: px(safe.height * 1.5),
        height: px(safe.height * 1.5),
        borderRadius: '9999px',
        backgroundColor: alpha(ink, 0.08),
      }),
      box({
        position: 'absolute',
        left: px(safe.x - safe.height * 0.95),
        top: px(safe.y + safe.height * 0.55),
        width: px(safe.height * 1.4),
        height: px(safe.height * 1.4),
        borderRadius: '9999px',
        border: `${px(Math.max(2, safe.height * 0.012))} solid ${alpha(ink, 0.16)}`,
      }),
      col(
        {
          position: 'absolute',
          left: px(safe.x + pad),
          top: px(safe.y + pad),
          width: px(inner.width),
          height: px(inner.height),
          justifyContent: 'center',
          alignItems: end ? 'flex-end' : 'center',
          gap: px(gap),
        },
        [
          input.logo && logo
            ? img(logoFor(input.logo, ink, primary), { width: px(logo.width), height: px(logo.height) })
            : null,
          text(
            {
              fontFamily: fonts.headings,
              fontWeight: 700,
              fontSize: px(titleSize),
              lineHeight: 1.05,
              color: ink,
              textAlign,
              textWrap: 'balance',
              maxWidth: px(inner.width),
            },
            title,
          ),
          text(
            {
              fontFamily: fonts.body,
              fontWeight: 400,
              fontSize: px(subtitleSize),
              lineHeight: 1.3,
              color: alpha(ink, 0.9),
              textAlign,
              textWrap: 'balance',
              maxWidth: px(inner.width * 0.92),
            },
            subtitle,
          ),
          footer
            ? box(
                {
                  marginTop: px(gap * 0.4),
                  padding: `${px(footerSize * 0.45)} ${px(footerSize * 1.1)}`,
                  borderRadius: '9999px',
                  backgroundColor: alpha(ink, 0.14),
                  color: ink,
                  fontFamily: fonts.body,
                  fontWeight: 700,
                  fontSize: px(footerSize),
                },
                footer,
              )
            : null,
        ],
      ),
    ],
  )
}

/** PNG naslovne; `outputWidth` je manja širina za pregled na ekranu. */
export async function renderProfileBanner(input: BannerInput, outputWidth?: number): Promise<Buffer> {
  const spec = PROFILE_BANNERS[input.kind]
  const loaded = await loadFonts([input.fonts.headings, input.fonts.body])
  const fonts = {
    headings: loaded.available.has(input.fonts.headings) ? input.fonts.headings : BUNDLED_FAMILY,
    body: loaded.available.has(input.fonts.body) ? input.fonts.body : BUNDLED_FAMILY,
  }
  const svg = await satori(bannerTree(input, fonts) as unknown as Parameters<typeof satori>[0], {
    width: spec.width,
    height: spec.height,
    fonts: loaded.fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
  })
  const width = Math.min(spec.width, outputWidth ?? spec.width)
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } })
    .render()
    .asPng()
  return sharp(Buffer.from(png)).png({ compressionLevel: 9 }).toBuffer()
}
