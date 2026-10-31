import type { SatoriNode } from '../templates'
import {
  alpha,
  box,
  brandMark,
  col,
  contrast,
  el,
  fit,
  handleText,
  icon,
  img,
  isDark,
  layered,
  mix,
  pointNumber,
  px,
  readable,
  sc,
  swipeHint,
  text,
  topBar,
  type Style,
} from './kit'
import type { DesignContext, Slide, StyleDef } from './types'

/**
 * Šareni stilovi (D-121): pune boje, krupna slova i fotografija u obliku (krug, luk, polaroid,
 * pola-pola, preko celog slajda). Rade u sva tri formata i bez fotografije, kada ukrasi u bojama
 * palete nose sliku. Boje dolaze iz palete: pozadina, tekst i dva naglaska.
 */
type Child = SatoriNode | string | null | undefined | false

const root = (ctx: DesignContext, style: Style, children: unknown[]) =>
  col(
    {
      width: px(ctx.size.width),
      height: px(ctx.size.height),
      position: 'relative',
      overflow: 'hidden',
      // Satori računa širinu bez unutrašnje margine: border-box drži sve unutar slike
      boxSizing: 'border-box',
      ...style,
    },
    layered(children) as never,
  )

const W = (ctx: DesignContext, padding: number) => ctx.size.width - padding * 2
const tall = (ctx: DesignContext) => (ctx.format === 'story' ? 1.35 : ctx.format === 'square' ? 0.82 : 1)
const byFormat = (ctx: DesignContext, v: { portrait: number; square: number; story: number }) => v[ctx.format]

interface Tone {
  bg: string
  fg: string
  a1: string
  a2: string
  on1: string
  on2: string
}

function tone(ctx: DesignContext): Tone {
  const bg = ctx.colors.background
  const a1 = ctx.colors.primary
  const a2 = ctx.colors.secondary
  return { bg, fg: readable(bg, ctx.colors.text), a1, a2, on1: readable(a1), on2: readable(a2) }
}

/** Apsolutno postavljen ukras (krug, traka, blok). */
const shape = (style: Style, children?: Child | Child[]) =>
  el('div', { position: 'absolute', display: 'flex', ...style }, children)

const circle = (size: number, color: string, pos: Style) =>
  shape({ width: px(size), height: px(size), borderRadius: px(size / 2), backgroundColor: color, ...pos })

/** Obris kruga kao svg (okvir sa zaobljenjem Satori crta kao zaobljen kvadrat). */
const ring = (size: number, color: string, stroke: number, pos: Style) =>
  shape({ width: px(size), height: px(size), ...pos }, [
    {
      type: 'svg',
      props: {
        width: size,
        height: size,
        viewBox: `0 0 ${size} ${size}`,
        style: { display: 'flex' },
        children: {
          type: 'circle',
          props: {
            cx: size / 2,
            cy: size / 2,
            r: size / 2 - stroke / 2,
            fill: 'none',
            stroke: color,
            strokeWidth: stroke,
          },
        },
      },
    } as unknown as SatoriNode,
  ])

/** Oznaka u obliku pilule (kategorija, broj slajda), po želji malo nakrivljena. */
function pill(ctx: DesignContext, label: string | null | undefined, bg: string, fg: string, rotate = 0) {
  if (!label) return null
  const s = sc(ctx)
  return text(
    {
      alignSelf: 'flex-start',
      backgroundColor: bg,
      color: fg,
      fontFamily: ctx.fonts.body,
      fontWeight: 700,
      fontSize: px(26 * s),
      letterSpacing: '2px',
      textTransform: 'uppercase',
      padding: `${px(12 * s)} ${px(28 * s)}`,
      borderRadius: px(60 * s),
      ...(rotate ? { transform: `rotate(${rotate}deg)` } : {}),
    },
    label,
  )
}

function heading(
  ctx: DesignContext,
  value: string,
  size: number,
  color: string,
  width: number,
  upper = false,
) {
  return text(
    {
      fontFamily: ctx.fonts.headings,
      fontSize: px(size),
      fontWeight: 700,
      lineHeight: upper ? 0.98 : 1.05,
      letterSpacing: upper ? '0px' : '-1px',
      color,
      width: px(width),
      ...(upper ? { textTransform: 'uppercase' } : {}),
    },
    value,
  )
}

function bodyText(
  ctx: DesignContext,
  value: string | null | undefined,
  color: string,
  width: number,
  size = 34,
) {
  const s = sc(ctx)
  return text(
    { fontFamily: ctx.fonts.body, fontSize: px(size * s), lineHeight: 1.38, color, width: px(width) },
    value,
  )
}

/** Dugme poziva na akciju: nalog brenda i strelica. */
function button(ctx: DesignContext, bg: string, fg: string) {
  const s = sc(ctx)
  return box(
    {
      alignSelf: 'flex-start',
      alignItems: 'center',
      gap: px(18 * s),
      backgroundColor: bg,
      color: fg,
      borderRadius: px(80 * s),
      padding: `${px(24 * s)} ${px(44 * s)}`,
      fontFamily: ctx.fonts.body,
      fontWeight: 700,
      fontSize: px(34 * s),
    },
    [text({}, handleText(ctx)), icon('arrow', 38 * s, fg, 2.6)],
  )
}

/** Dno slajda: znak brenda i strelica „prevuci”, a na poslednjem slajdu dugme. */
function footer(ctx: DesignContext, slide: Slide, color: string, buttonBg: string, buttonFg: string) {
  const s = sc(ctx)
  if (slide.kind === 'cta') return button(ctx, buttonBg, buttonFg)
  return box({ justifyContent: 'space-between', alignItems: 'center' }, [
    brandMark(ctx, 50 * s, color),
    swipeHint(ctx, color),
  ])
}

/** Krug sa brojem slajda sadržaja. */
function numberBadge(ctx: DesignContext, bg: string, fg: string, size = 124, rotate = 0) {
  const s = sc(ctx)
  return box(
    {
      width: px(size * s),
      height: px(size * s),
      borderRadius: px((size * s) / 2),
      backgroundColor: bg,
      color: fg,
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: ctx.fonts.headings,
      fontWeight: 700,
      fontSize: px(size * 0.42 * s),
      ...(rotate ? { transform: `rotate(${rotate}deg)` } : {}),
    },
    pointNumber(ctx),
  )
}

// Pop: preliv, veliki krugovi u naglascima i fotografija u krugu -----------------------------------
const pop: StyleDef = {
  id: 'pop',
  group: 'type',
  fonts: { headings: 'Montserrat', body: 'Inter' },
  photo: 'cover',
  render(slide, ctx) {
    const s = sc(ctx)
    const { width: Wd, height: Hd } = ctx.size
    const t = tone(ctx)
    const p = 80 * s
    const photo = slide.kind === 'cover' ? ctx.photo : null
    const ph = Wd * byFormat(ctx, { portrait: 0.5, square: 0.34, story: 0.64 })
    const big = Wd * 0.82
    const titleSize = fit(slide.title, {
      max: (slide.kind === 'point' ? 92 : 112) * s,
      min: 48 * s,
      width: W(ctx, p),
      height: Hd * (photo ? byFormat(ctx, { portrait: 0.26, square: 0.24, story: 0.24 }) : 0.36) * tall(ctx),
      lineHeight: 1.05,
      charWidth: 0.62,
    })
    return root(
      ctx,
      {
        backgroundImage: `linear-gradient(155deg, ${t.bg} 0%, ${mix(t.bg, t.a2, 0.3)} 100%)`,
        padding: px(p),
        color: t.fg,
        justifyContent: 'space-between',
      },
      [
        circle(big, t.a1, { right: px(-big * 0.36), top: px(-big * 0.4) }),
        circle(Wd * 0.3, t.a2, { right: px(-Wd * 0.08), bottom: px(-Wd * 0.08) }),
        ring(Wd * 0.18, alpha(t.fg, 0.22), 12 * s, { left: px(Wd * 0.1), top: px(Hd * 0.16) }),
        photo
          ? img(photo, {
              position: 'absolute',
              width: px(ph),
              height: px(ph),
              borderRadius: px(ph / 2),
              objectFit: 'cover',
              border: `${px(16 * s)} solid ${t.bg}`,
              right: px(Wd * 0.07),
              top: px(Hd * byFormat(ctx, { portrait: 0.09, square: 0.1, story: 0.1 })),
            })
          : null,
        topBar(ctx, alpha(t.fg, 0.85)),
        // tekst je na dnu, ispod fotografije u krugu
        box({ flexGrow: 1 }),
        col({ gap: px(24 * s) }, [
          slide.kind === 'point' ? numberBadge(ctx, t.a1, t.on1) : pill(ctx, slide.kicker, t.a1, t.on1, -3),
          heading(ctx, slide.title, titleSize, t.fg, W(ctx, p)),
          bodyText(ctx, slide.body, alpha(t.fg, 0.9), W(ctx, p) * 0.92, ctx.format === 'square' ? 30 : 34),
        ]),
        box({ height: px(40 * s) }),
        footer(ctx, slide, t.fg, t.fg, t.bg),
      ],
    )
  },
}

// Magazin: fotografija preko celog slajda, veo u boji palete i krupan kondenzovan naslov -----------
const magazine: StyleDef = {
  id: 'magazine',
  group: 'photo',
  fonts: { headings: 'Oswald', body: 'Inter' },
  photo: 'all',
  render(slide, ctx) {
    const s = sc(ctx)
    const { width: Wd, height: Hd } = ctx.size
    const t = tone(ctx)
    const p = 76 * s
    const heavy = slide.kind !== 'cover'
    const full = { left: 0, top: 0, width: px(Wd), height: px(Hd) }
    const titleSize = fit(slide.title.toUpperCase(), {
      max: (slide.kind === 'cover' ? 148 : 104) * s,
      min: 56 * s,
      width: W(ctx, p),
      height: Hd * (heavy ? 0.26 : 0.3) * tall(ctx),
      lineHeight: 0.98,
      charWidth: 0.47,
    })
    const barColor = ctx.photo ? '#FFFFFF' : readable(t.a2)
    return root(
      ctx,
      { backgroundColor: t.bg, padding: px(p), justifyContent: 'space-between', color: t.fg },
      [
        ctx.photo
          ? img(ctx.photo, { position: 'absolute', ...full, objectFit: 'cover' })
          : shape({ ...full, backgroundImage: `linear-gradient(165deg, ${t.a2} 0%, ${t.bg} 72%)` }),
        ctx.photo
          ? null
          : circle(Wd * 0.9, alpha(t.a1, 0.92), { right: px(-Wd * 0.38), top: px(-Wd * 0.34) }),
        ctx.photo
          ? null
          : ring(Wd * 0.3, alpha(barColor, 0.35), 14 * s, { left: px(Wd * 0.1), top: px(Hd * 0.16) }),
        shape({
          ...full,
          backgroundImage: `linear-gradient(0deg, ${t.bg} 0%, ${alpha(t.bg, 0.94)} ${heavy ? 44 : 28}%, ${alpha(
            t.bg,
            heavy ? 0.55 : 0.2,
          )} ${heavy ? 68 : 58}%, ${alpha(t.bg, 0)} ${heavy ? 86 : 76}%)`,
        }),
        ctx.photo
          ? shape({
              left: 0,
              top: 0,
              width: px(Wd),
              height: px(Hd * 0.2),
              backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 100%)',
            })
          : null,
        topBar(ctx, barColor),
        col({ gap: px(22 * s) }, [
          slide.kind === 'point'
            ? text(
                {
                  fontFamily: ctx.fonts.headings,
                  fontWeight: 700,
                  fontSize: px(170 * s),
                  lineHeight: 0.9,
                  color: contrast(t.a1, t.bg) >= 2 ? t.a1 : t.fg,
                },
                pointNumber(ctx),
              )
            : pill(ctx, slide.kicker, t.a1, t.on1),
          heading(ctx, slide.title, titleSize, t.fg, W(ctx, p), true),
          bodyText(ctx, slide.body, alpha(t.fg, 0.9), W(ctx, p) * 0.94, 32),
          footer(ctx, slide, t.fg, t.a1, t.on1),
        ]),
      ],
    )
  },
}

// Pola-pola: gornja polovina fotografija, donja puna boja, oznaka na spoju -------------------------
const split: StyleDef = {
  id: 'split',
  group: 'photo',
  fonts: { headings: 'Montserrat', body: 'Inter' },
  photo: 'all',
  render(slide, ctx) {
    const s = sc(ctx)
    const { width: Wd, height: Hd } = ctx.size
    const t = tone(ctx)
    const p = 76 * s
    const topH = Math.round(Hd * byFormat(ctx, { portrait: 0.47, square: 0.42, story: 0.5 }))
    const label = slide.kind === 'point' ? pointNumber(ctx) : slide.kicker
    const titleSize = fit(slide.title, {
      max: (slide.kind === 'point' ? 84 : 100) * s,
      min: 46 * s,
      width: W(ctx, p),
      height: (Hd - topH) * 0.4,
      lineHeight: 1.05,
      charWidth: 0.62,
    })
    return root(ctx, { backgroundColor: t.bg, padding: px(p), color: t.fg }, [
      ctx.photo
        ? img(ctx.photo, {
            position: 'absolute',
            left: 0,
            top: 0,
            width: px(Wd),
            height: px(topH),
            objectFit: 'cover',
          })
        : shape({
            left: 0,
            top: 0,
            width: px(Wd),
            height: px(topH),
            backgroundImage: `linear-gradient(135deg, ${t.a1} 0%, ${t.a2} 100%)`,
          }),
      ctx.photo
        ? null
        : circle(topH * 0.95, alpha(t.bg, 0.2), { right: px(-topH * 0.25), top: px(-topH * 0.3) }),
      ctx.photo
        ? null
        : ring(topH * 0.42, alpha('#FFFFFF', 0.4), 14 * s, { left: px(Wd * 0.1), top: px(topH * 0.34) }),
      ctx.photo
        ? shape({
            left: 0,
            top: 0,
            width: px(Wd),
            height: px(Hd * 0.16),
            backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 100%)',
          })
        : null,
      label
        ? text(
            {
              position: 'absolute',
              left: px(p),
              top: px(topH - 34 * s),
              backgroundColor: t.a1,
              color: t.on1,
              fontFamily: ctx.fonts.headings,
              fontWeight: 700,
              fontSize: px(30 * s),
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              padding: `${px(14 * s)} ${px(30 * s)}`,
              borderRadius: px(40 * s),
              transform: 'rotate(-2deg)',
              boxShadow: `0 ${px(10 * s)} ${px(24 * s)} rgba(0,0,0,0.25)`,
            },
            label,
          )
        : null,
      topBar(ctx, ctx.photo ? '#FFFFFF' : readable(t.a1)),
      box({ height: px(topH - p - 26 * s + 64 * s) }),
      col({ flexGrow: 1, justifyContent: 'space-between', gap: px(20 * s) }, [
        col({ gap: px(20 * s) }, [
          heading(ctx, slide.title, titleSize, t.fg, W(ctx, p)),
          bodyText(ctx, slide.body, alpha(t.fg, 0.88), W(ctx, p), ctx.format === 'square' ? 30 : 33),
        ]),
        footer(ctx, slide, t.fg, t.a1, t.on1),
      ]),
    ])
  },
}

// Nalepnica: bela kartica nakrivljena preko pune boje, trake i polaroid fotografija -----------------
const sticker: StyleDef = {
  id: 'sticker',
  group: 'type',
  fonts: { headings: 'Montserrat', body: 'Inter' },
  photo: 'cover',
  render(slide, ctx) {
    const s = sc(ctx)
    const { width: Wd, height: Hd } = ctx.size
    const t = tone(ctx)
    const p = 72 * s
    const ink = '#16161F'
    const accentInk = contrast(t.a1, '#FFFFFF') >= 3 ? t.a1 : ink
    const photo = slide.kind === 'cover' ? ctx.photo : null
    const cardW = W(ctx, p) - 24 * s
    const inner = cardW - 112 * s
    const phW = Wd * byFormat(ctx, { portrait: 0.46, square: 0.32, story: 0.6 })
    const titleSize = fit(slide.title, {
      max: (slide.kind === 'point' ? 80 : 94) * s,
      min: 44 * s,
      width: inner,
      height: Hd * (photo ? 0.22 : 0.32) * tall(ctx),
      lineHeight: 1.06,
      charWidth: 0.62,
    })
    const tape = (pos: Style, rot: number) =>
      shape({
        width: px(180 * s),
        height: px(52 * s),
        backgroundColor: alpha(t.a2, 0.88),
        transform: `rotate(${rot}deg)`,
        ...pos,
      })
    const card = col(
      {
        alignSelf: 'center',
        width: px(cardW),
        backgroundColor: '#FFFFFF',
        color: ink,
        borderRadius: px(40 * s),
        padding: px(56 * s),
        gap: px(20 * s),
        transform: 'rotate(-2deg)',
        boxShadow: `0 ${px(28 * s)} ${px(60 * s)} rgba(0,0,0,0.25)`,
        position: 'relative',
      },
      [
        slide.kind === 'point'
          ? box({ height: px(40 * s) })
          : text(
              {
                fontFamily: ctx.fonts.body,
                fontWeight: 700,
                fontSize: px(26 * s),
                letterSpacing: '2px',
                textTransform: 'uppercase',
                color: accentInk,
              },
              slide.kicker,
            ),
        heading(ctx, slide.title, titleSize, ink, inner),
        box({ width: px(150 * s), height: px(14 * s), borderRadius: px(7 * s), backgroundColor: t.a1 }),
        bodyText(ctx, slide.body, alpha(ink, 0.78), inner, ctx.format === 'square' ? 29 : 32),
        slide.kind === 'cta' ? button(ctx, t.a1, t.on1) : null,
        tape({ top: px(-26 * s), left: px(56 * s) }, -8),
        tape({ top: px(-22 * s), right: px(56 * s) }, 7),
        slide.kind === 'point'
          ? shape({ top: px(-58 * s), left: px(-26 * s) }, [numberBadge(ctx, t.a1, t.on1, 124, -10)])
          : null,
      ],
    )
    return root(ctx, { backgroundColor: t.bg, padding: px(p), color: t.fg }, [
      circle(Wd * 0.62, alpha(t.a1, 0.9), { left: px(-Wd * 0.26), top: px(Hd * 0.12) }),
      circle(Wd * 0.34, alpha(t.a2, 0.9), { right: px(-Wd * 0.1), bottom: px(Hd * 0.08) }),
      ring(Wd * 0.16, alpha(t.fg, 0.25), 10 * s, { right: px(Wd * 0.1), top: px(Hd * 0.12) }),
      photo
        ? col(
            {
              position: 'absolute',
              top: px(Hd * byFormat(ctx, { portrait: 0.08, square: 0.09, story: 0.08 })),
              right: px(Wd * 0.08),
              backgroundColor: '#FFFFFF',
              padding: `${px(16 * s)} ${px(16 * s)} ${px(56 * s)}`,
              transform: 'rotate(6deg)',
              boxShadow: `0 ${px(20 * s)} ${px(44 * s)} rgba(0,0,0,0.28)`,
            },
            [img(photo, { width: px(phW), height: px(phW), objectFit: 'cover' })],
          )
        : null,
      topBar(ctx, alpha(t.fg, 0.85)),
      box({ flexGrow: 1 }),
      card,
      box({ flexGrow: photo ? 0 : 1, minHeight: px(40 * s) }),
      box({ justifyContent: 'space-between', alignItems: 'center' }, [
        brandMark(ctx, 46 * s, t.fg),
        swipeHint(ctx, t.fg),
      ]),
    ])
  },
}

/** Cik-cak linija kao ukras (Satori crta svg). */
function zigzag(width: number, height: number, color: string, stroke: number): SatoriNode {
  const steps = 6
  const points = Array.from({ length: steps + 1 }, (_, i) => `${(i * width) / steps},${i % 2 ? 0 : height}`)
  return {
    type: 'svg',
    props: {
      width,
      height: height + stroke * 2,
      viewBox: `0 ${-stroke} ${width} ${height + stroke * 2}`,
      style: { display: 'flex' },
      children: {
        type: 'polyline',
        props: {
          points: points.join(' '),
          fill: 'none',
          stroke: color,
          strokeWidth: stroke,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
      },
    },
  } as unknown as SatoriNode
}

// Blokovi: geometrijski oblici u naglascima i fotografija u luku ------------------------------------
const blocks: StyleDef = {
  id: 'blocks',
  group: 'type',
  fonts: { headings: 'Montserrat', body: 'Inter' },
  photo: 'cover',
  render(slide, ctx) {
    const s = sc(ctx)
    const { width: Wd, height: Hd } = ctx.size
    const t = tone(ctx)
    const p = 80 * s
    const photo = slide.kind === 'cover' ? ctx.photo : null
    const archW = Wd * byFormat(ctx, { portrait: 0.42, square: 0.3, story: 0.56 })
    const archH = archW * 1.12
    const titleSize = fit(slide.title, {
      max: (slide.kind === 'point' ? 90 : photo ? 96 : 108) * s,
      min: 48 * s,
      width: W(ctx, p),
      height: Hd * (photo ? 0.22 : 0.36) * tall(ctx),
      lineHeight: 1.05,
      charWidth: 0.62,
    })
    const dots = col(
      { position: 'absolute', right: px(Wd * 0.1), top: px(Hd * 0.13), gap: px(18 * s) },
      [0, 1, 2].map(() =>
        box(
          { gap: px(18 * s) },
          [0, 1, 2].map(() =>
            box({
              width: px(14 * s),
              height: px(14 * s),
              borderRadius: px(7 * s),
              backgroundColor: alpha(t.fg, 0.45),
            }),
          ),
        ),
      ),
    )
    return root(
      ctx,
      { backgroundColor: t.bg, padding: px(p), color: t.fg, justifyContent: 'space-between' },
      [
        circle(Wd * 0.56, t.a1, { left: px(-Wd * 0.28), top: px(-Wd * 0.28) }),
        circle(Wd * 0.58, t.a2, { right: px(-Wd * 0.28), bottom: px(-Wd * 0.26) }),
        photo
          ? img(photo, {
              position: 'absolute',
              right: px(Wd * 0.08),
              top: px(Hd * byFormat(ctx, { portrait: 0.11, square: 0.1, story: 0.1 })),
              width: px(archW),
              height: px(archH),
              objectFit: 'cover',
              borderTopLeftRadius: px(archW / 2),
              borderTopRightRadius: px(archW / 2),
              border: `${px(12 * s)} solid ${t.fg}`,
            })
          : dots,
        photo
          ? null
          : shape({
              right: px(Wd * 0.3),
              top: px(Hd * 0.2),
              width: px(86 * s),
              height: px(86 * s),
              backgroundColor: alpha(t.fg, 0.85),
              transform: 'rotate(18deg)',
            }),
        shape({ left: px(p), top: px(Hd * 0.15) }, [zigzag(220 * s, 40 * s, t.a1, 10 * s)]),
        topBar(ctx, contrast(t.a1, t.fg) >= 3 ? t.fg : readable(t.a1)),
        // tekst je na dnu, ispod fotografije u luku
        box({ flexGrow: 1 }),
        col({ gap: px(24 * s) }, [
          slide.kind === 'point'
            ? numberBadge(ctx, t.fg, t.bg, 118)
            : slide.kicker
              ? text(
                  {
                    alignSelf: 'flex-start',
                    fontFamily: ctx.fonts.body,
                    fontWeight: 700,
                    fontSize: px(26 * s),
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    paddingBottom: px(8 * s),
                    borderBottom: `${px(6 * s)} solid ${t.a1}`,
                  },
                  slide.kicker,
                )
              : null,
          heading(ctx, slide.title, titleSize, t.fg, W(ctx, p)),
          bodyText(ctx, slide.body, alpha(t.fg, 0.88), W(ctx, p) * 0.6, ctx.format === 'square' ? 29 : 33),
        ]),
        box({ height: px(40 * s) }),
        footer(ctx, slide, t.fg, t.fg, t.bg),
      ],
    )
  },
}

// Aurora: meki prelivi u naglascima i providna ploča sa tekstom -----------------------------------
const aurora: StyleDef = {
  id: 'aurora',
  group: 'type',
  fonts: { headings: 'Montserrat', body: 'Inter' },
  photo: 'cover',
  render(slide, ctx) {
    const s = sc(ctx)
    const { width: Wd, height: Hd } = ctx.size
    const t = tone(ctx)
    const p = 72 * s
    const photo = slide.kind === 'cover' ? ctx.photo : null
    const dark = isDark(t.bg)
    const inner = W(ctx, p) - 112 * s
    const phH = Hd * byFormat(ctx, { portrait: 0.3, square: 0.24, story: 0.34 })
    // na svetloj podlozi prelivi su blaži (svetla meka tema, D-123), na tamnoj pune jačine
    const strength = dark ? 0.95 : 0.6
    const glow = (x: number, y: number, color: string, reach: number) =>
      shape({
        left: 0,
        top: 0,
        width: px(Wd),
        height: px(Hd),
        backgroundImage: `radial-gradient(circle at ${x}% ${y}%, ${alpha(color, strength)} 0%, ${alpha(color, 0)} ${reach}%)`,
      })
    const titleSize = fit(slide.title, {
      max: (slide.kind === 'point' ? 84 : 98) * s,
      min: 44 * s,
      width: inner,
      height: Hd * (photo ? 0.22 : 0.32) * tall(ctx),
      lineHeight: 1.06,
      charWidth: 0.62,
    })
    return root(ctx, { backgroundColor: t.bg, padding: px(p), color: t.fg }, [
      glow(10, 12, t.a1, 50),
      glow(92, 24, t.a2, 52),
      glow(55, 100, mix(t.a1, t.a2, 0.5), 52),
      topBar(ctx, alpha(t.fg, 0.85)),
      photo
        ? img(photo, {
            marginTop: px(36 * s),
            width: px(W(ctx, p)),
            height: px(phH),
            objectFit: 'cover',
            borderRadius: px(40 * s),
            boxShadow: `0 ${px(24 * s)} ${px(50 * s)} rgba(0,0,0,0.3)`,
          })
        : null,
      box({ flexGrow: 1 }),
      col(
        {
          backgroundColor: dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.55)',
          border: `${px(2 * s)} solid rgba(255,255,255,0.5)`,
          borderRadius: px(48 * s),
          padding: px(56 * s),
          gap: px(20 * s),
        },
        [
          slide.kind === 'point' ? numberBadge(ctx, t.a1, t.on1, 104) : pill(ctx, slide.kicker, t.a1, t.on1),
          heading(ctx, slide.title, titleSize, t.fg, inner),
          bodyText(ctx, slide.body, alpha(t.fg, 0.88), inner, ctx.format === 'square' ? 29 : 32),
          slide.kind === 'cta' ? button(ctx, t.fg, t.bg) : null,
        ],
      ),
      box({ minHeight: px(36 * s) }),
      box({ justifyContent: 'space-between', alignItems: 'center' }, [
        brandMark(ctx, 46 * s, t.fg),
        swipeHint(ctx, t.fg),
      ]),
    ])
  },
}

export const VIVID_STYLES: StyleDef[] = [pop, magazine, split, sticker, blocks, aurora]
