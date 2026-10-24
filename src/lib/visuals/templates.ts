/**
 * Šabloni vizuala (brif 6.2): čiste funkcije koje vraćaju Satori stablo elemenata.
 * Boje i fontovi dolaze iz profila brenda; slika i logo kao data URI (Satori ne preuzima mrežu).
 */
export type TemplateId = 'photo-overlay' | 'solid' | 'split' | 'announcement'
export const TEMPLATE_IDS: TemplateId[] = ['photo-overlay', 'solid', 'split', 'announcement']

export const TEMPLATE_LABELS: Record<TemplateId, string> = {
  'photo-overlay': 'Fotografija sa naslovom',
  solid: 'Boja brenda i poruka',
  split: 'Fotografija pored teksta',
  announcement: 'Najava sa okvirom',
}

export type TemplateAspect = '1:1' | '4:5' | '9:16' | '16:9' | '3:4'
export const ASPECT_SIZES: Record<TemplateAspect, { width: number; height: number }> = {
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '3:4': { width: 1080, height: 1440 },
}

export interface TemplateColors {
  primary: string
  secondary: string
  accent: string
  neutralLight: string
  neutralDark: string
  textOnPrimary: string
}

export interface TemplateInput {
  headline: string
  subtext?: string | null
  cta?: string | null
  brandName: string
  colors: TemplateColors
  fonts: { headings: string; body: string }
  logoDataUri?: string | null
  imageDataUri?: string | null
  size: { width: number; height: number }
  /** mala atribucija (Unsplash) u uglu */
  attribution?: string | null
}

export type SatoriNode = {
  type: string
  props: Record<string, unknown> & {
    children?: SatoriNode | SatoriNode[] | string | null
    style?: Record<string, string | number>
  }
}

const el = (
  type: string,
  style: Record<string, string | number>,
  children?: SatoriNode | SatoriNode[] | string | null,
  extra: Record<string, unknown> = {},
): SatoriNode => ({
  type,
  props: { ...extra, style, children: children ?? undefined },
})

/** Veličina naslova zavisi od dužine teksta i širine platna. */
export function headlineSize(headline: string, width: number): number {
  const base = width / 12
  const len = headline.length
  const factor = len <= 30 ? 1 : len <= 60 ? 0.8 : len <= 90 ? 0.65 : 0.55
  return Math.round(base * factor)
}

export function pickTemplate(input: {
  hasImage: boolean
  headline: string
  subtext?: string | null
  aspect: TemplateAspect
}): TemplateId {
  if (!input.hasImage) return input.subtext ? 'announcement' : 'solid'
  if (input.aspect === '16:9' || input.aspect === '1:1')
    return input.headline.length > 70 ? 'split' : 'photo-overlay'
  return 'photo-overlay'
}

const px = (n: number) => `${Math.round(n)}px`

function logoNode(input: TemplateInput, height: number, onDark: boolean): SatoriNode {
  if (input.logoDataUri) {
    return el('img', { height: px(height), objectFit: 'contain' }, undefined, { src: input.logoDataUri })
  }
  return el(
    'div',
    {
      fontFamily: input.fonts.headings,
      fontWeight: 700,
      fontSize: px(height * 0.6),
      color: onDark ? '#ffffff' : input.colors.neutralDark,
      letterSpacing: '-0.5px',
    },
    input.brandName,
  )
}

function ctaNode(input: TemplateInput, bg: string, fg: string, fontSize: number): SatoriNode | null {
  if (!input.cta) return null
  return el(
    'div',
    {
      display: 'flex',
      alignSelf: 'flex-start',
      backgroundColor: bg,
      color: fg,
      fontFamily: input.fonts.body,
      fontWeight: 700,
      fontSize: px(fontSize),
      padding: `${px(fontSize * 0.55)} ${px(fontSize * 1.1)}`,
      borderRadius: px(fontSize * 1.2),
    },
    input.cta,
  )
}

function attributionNode(input: TemplateInput, color: string, fontSize: number): SatoriNode | null {
  if (!input.attribution) return null
  return el(
    'div',
    {
      position: 'absolute',
      right: px(fontSize),
      bottom: px(fontSize * 0.6),
      fontFamily: input.fonts.body,
      fontSize: px(fontSize),
      color,
      opacity: 0.85,
    },
    input.attribution,
  )
}

function photoOverlay(input: TemplateInput): SatoriNode {
  const { width, height } = input.size
  const pad = width * 0.07
  const h = headlineSize(input.headline, width)
  const body = Math.round(h * 0.45)
  return el(
    'div',
    {
      display: 'flex',
      width: px(width),
      height: px(height),
      position: 'relative',
      backgroundColor: input.colors.neutralDark,
    },
    [
      input.imageDataUri
        ? el(
            'img',
            {
              position: 'absolute',
              top: 0,
              left: 0,
              width: px(width),
              height: px(height),
              objectFit: 'cover',
            },
            undefined,
            { src: input.imageDataUri },
          )
        : el('div', {
            position: 'absolute',
            top: 0,
            left: 0,
            width: px(width),
            height: px(height),
            backgroundColor: input.colors.primary,
          }),
      el('div', {
        position: 'absolute',
        top: 0,
        left: 0,
        width: px(width),
        height: px(height),
        backgroundImage:
          'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0.78) 100%)',
      }),
      el(
        'div',
        { position: 'absolute', left: px(pad), top: px(pad), display: 'flex', alignItems: 'center' },
        logoNode(input, Math.round(width * 0.07), true),
      ),
      el(
        'div',
        {
          position: 'absolute',
          left: px(pad),
          right: px(pad),
          bottom: px(pad),
          display: 'flex',
          flexDirection: 'column',
          gap: px(body * 0.8),
        },
        [
          el('div', {
            width: px(width * 0.12),
            height: px(Math.max(6, width * 0.007)),
            backgroundColor: input.colors.accent,
            borderRadius: px(4),
          }),
          el(
            'div',
            {
              fontFamily: input.fonts.headings,
              fontWeight: 700,
              fontSize: px(h),
              lineHeight: 1.1,
              color: '#ffffff',
              letterSpacing: '-1px',
            },
            input.headline,
          ),
          input.subtext
            ? el(
                'div',
                {
                  fontFamily: input.fonts.body,
                  fontSize: px(body),
                  lineHeight: 1.35,
                  color: 'rgba(255,255,255,0.9)',
                },
                input.subtext,
              )
            : null,
          ctaNode(input, input.colors.accent, pickText(input.colors.accent), Math.round(body * 0.85)),
        ].filter(Boolean) as SatoriNode[],
      ),
      attributionNode(input, 'rgba(255,255,255,0.75)', Math.round(width * 0.016)),
    ].filter(Boolean) as SatoriNode[],
  )
}

function solid(input: TemplateInput): SatoriNode {
  const { width, height } = input.size
  const pad = width * 0.09
  const h = headlineSize(input.headline, width) * 1.05
  const body = Math.round(h * 0.42)
  const fg = input.colors.textOnPrimary
  return el(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      width: px(width),
      height: px(height),
      padding: px(pad),
      backgroundColor: input.colors.primary,
      position: 'relative',
    },
    [
      el('div', {
        position: 'absolute',
        right: px(-width * 0.2),
        top: px(-width * 0.2),
        width: px(width * 0.6),
        height: px(width * 0.6),
        borderRadius: '50%',
        backgroundColor: input.colors.secondary,
        opacity: 0.35,
      }),
      el('div', { display: 'flex' }, logoNode(input, Math.round(width * 0.07), fg === '#ffffff')),
      el(
        'div',
        { display: 'flex', flexDirection: 'column', gap: px(body) },
        [
          el(
            'div',
            {
              fontFamily: input.fonts.headings,
              fontWeight: 700,
              fontSize: px(h),
              lineHeight: 1.08,
              color: fg,
              letterSpacing: '-1px',
            },
            input.headline,
          ),
          input.subtext
            ? el(
                'div',
                {
                  fontFamily: input.fonts.body,
                  fontSize: px(body),
                  lineHeight: 1.35,
                  color: fg,
                  opacity: 0.9,
                },
                input.subtext,
              )
            : null,
          ctaNode(input, input.colors.accent, pickText(input.colors.accent), Math.round(body * 0.85)),
        ].filter(Boolean) as SatoriNode[],
      ),
      el(
        'div',
        { fontFamily: input.fonts.body, fontSize: px(width * 0.02), color: fg, opacity: 0.7 },
        input.brandName,
      ),
    ],
  )
}

function split(input: TemplateInput): SatoriNode {
  const { width, height } = input.size
  const horizontal = width >= height
  const pad = width * 0.06
  const h = headlineSize(input.headline, horizontal ? width * 0.55 : width) * (horizontal ? 1.1 : 1)
  const body = Math.round(h * 0.45)
  const imageBox = horizontal
    ? { width: px(width * 0.48), height: px(height) }
    : { width: px(width), height: px(height * 0.5) }
  const image = input.imageDataUri
    ? el('img', { ...imageBox, objectFit: 'cover' }, undefined, { src: input.imageDataUri })
    : el('div', { ...imageBox, backgroundColor: input.colors.secondary })
  const text = el(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      flex: 1,
      padding: px(pad),
      backgroundColor: input.colors.neutralLight,
    },
    [
      el('div', { display: 'flex' }, logoNode(input, Math.round(width * 0.06), false)),
      el(
        'div',
        { display: 'flex', flexDirection: 'column', gap: px(body * 0.8) },
        [
          el('div', {
            width: px(width * 0.08),
            height: px(Math.max(6, width * 0.006)),
            backgroundColor: input.colors.accent,
          }),
          el(
            'div',
            {
              fontFamily: input.fonts.headings,
              fontWeight: 700,
              fontSize: px(h),
              lineHeight: 1.1,
              color: input.colors.neutralDark,
              letterSpacing: '-1px',
            },
            input.headline,
          ),
          input.subtext
            ? el(
                'div',
                {
                  fontFamily: input.fonts.body,
                  fontSize: px(body),
                  lineHeight: 1.35,
                  color: input.colors.neutralDark,
                  opacity: 0.8,
                },
                input.subtext,
              )
            : null,
          ctaNode(input, input.colors.primary, input.colors.textOnPrimary, Math.round(body * 0.85)),
        ].filter(Boolean) as SatoriNode[],
      ),
      el(
        'div',
        {
          fontFamily: input.fonts.body,
          fontSize: px(width * 0.018),
          color: input.colors.neutralDark,
          opacity: 0.6,
        },
        input.attribution ?? input.brandName,
      ),
    ],
  )
  return el(
    'div',
    {
      display: 'flex',
      flexDirection: horizontal ? 'row' : 'column',
      width: px(width),
      height: px(height),
      backgroundColor: input.colors.neutralLight,
    },
    [image, text],
  )
}

function announcement(input: TemplateInput): SatoriNode {
  const { width, height } = input.size
  const pad = width * 0.08
  const h = headlineSize(input.headline, width)
  const body = Math.round(h * 0.45)
  return el(
    'div',
    {
      display: 'flex',
      width: px(width),
      height: px(height),
      padding: px(pad * 0.5),
      backgroundColor: input.colors.neutralLight,
    },
    [
      el(
        'div',
        {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: px(pad * 0.8),
          border: `${px(Math.max(4, width * 0.006))} solid ${input.colors.primary}`,
          borderRadius: px(width * 0.02),
          position: 'relative',
        },
        [
          el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, [
            logoNode(input, Math.round(width * 0.07), false),
            el(
              'div',
              {
                display: 'flex',
                backgroundColor: input.colors.accent,
                color: pickText(input.colors.accent),
                fontFamily: input.fonts.body,
                fontWeight: 700,
                fontSize: px(width * 0.02),
                padding: `${px(width * 0.008)} ${px(width * 0.02)}`,
                borderRadius: px(width * 0.02),
              },
              input.brandName,
            ),
          ]),
          el(
            'div',
            { display: 'flex', flexDirection: 'column', gap: px(body) },
            [
              el(
                'div',
                {
                  fontFamily: input.fonts.headings,
                  fontWeight: 700,
                  fontSize: px(h),
                  lineHeight: 1.1,
                  color: input.colors.neutralDark,
                  letterSpacing: '-1px',
                },
                input.headline,
              ),
              input.subtext
                ? el(
                    'div',
                    {
                      fontFamily: input.fonts.body,
                      fontSize: px(body),
                      lineHeight: 1.4,
                      color: input.colors.neutralDark,
                      opacity: 0.85,
                    },
                    input.subtext,
                  )
                : null,
            ].filter(Boolean) as SatoriNode[],
          ),
          el(
            'div',
            { display: 'flex' },
            ctaNode(input, input.colors.primary, input.colors.textOnPrimary, Math.round(body * 0.9)) ??
              el('div', {
                width: px(width * 0.12),
                height: px(Math.max(6, width * 0.007)),
                backgroundColor: input.colors.primary,
              }),
          ),
        ],
      ),
    ],
  )
}

/** Crn ili beo tekst preko boje, po relativnoj luminansi. */
export function pickText(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return lum > 0.45 ? '#111111' : '#ffffff'
}

export function buildTemplate(id: TemplateId, input: TemplateInput): SatoriNode {
  switch (id) {
    case 'photo-overlay':
      return photoOverlay(input)
    case 'solid':
      return solid(input)
    case 'split':
      return split(input)
    case 'announcement':
      return announcement(input)
  }
}
