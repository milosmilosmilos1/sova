import {
  alpha,
  box,
  brandMark,
  col,
  counterText,
  el,
  fit,
  handleText,
  icon,
  img,
  isDark,
  listItems,
  mix,
  pointNumber,
  px,
  readable,
  sc,
  statValue,
  swipeHint,
  text,
  topBar,
  layered,
} from './kit'
import type { DesignContext, Slide, StyleDef } from './types'

/**
 * Tipografski stilovi (D-108): nose poruku slovima i bojama brenda. Fotografiju koriste samo
 * „Kartice”, „Beleška” i „Pamflet”, i to kad je ima.
 */

const root = (ctx: DesignContext, style: Record<string, string | number>, children: unknown[]) =>
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

// Bold Statement: jedna snažna rečenica preko pune boje brenda -----------------------------------
const bold: StyleDef = {
  id: 'bold',
  group: 'type',
  fonts: { headings: 'brand', body: 'brand' },
  photo: 'none',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 84 * s
    const bg = ctx.colors.primary
    const fg = readable(bg, '#ffffff')
    const titleSize = fit(slide.title, {
      max: (slide.kind === 'point' ? 92 : 124) * s,
      min: 52 * s,
      width: W(ctx, p),
      height: ctx.size.height * 0.42 * tall(ctx),
      lineHeight: 1.02,
      charWidth: 0.58,
    })
    return root(ctx, { backgroundColor: bg, padding: px(p), color: fg, justifyContent: 'space-between' }, [
      topBar(ctx, alpha(fg, 0.75)),
      col({ gap: px(28 * s) }, [
        slide.kind === 'point'
          ? text(
              {
                fontFamily: ctx.fonts.headings,
                fontSize: px(150 * s),
                fontWeight: 700,
                color: alpha(fg, 0.22),
                lineHeight: 1,
              },
              pointNumber(ctx),
            )
          : text(
              {
                fontFamily: ctx.fonts.body,
                fontSize: px(26 * s),
                letterSpacing: '4px',
                textTransform: 'uppercase',
                color: alpha(fg, 0.8),
              },
              slide.kicker,
            ),
        text(
          {
            fontFamily: ctx.fonts.headings,
            fontSize: px(titleSize),
            fontWeight: 700,
            lineHeight: 1.02,
            letterSpacing: '-1.5px',
            width: px(W(ctx, p)),
          },
          slide.title,
        ),
        text(
          {
            fontFamily: ctx.fonts.body,
            fontSize: px(34 * s),
            lineHeight: 1.35,
            color: alpha(fg, 0.88),
            width: px(W(ctx, p) * 0.9),
          },
          slide.body,
        ),
      ]),
      box({ justifyContent: 'space-between', alignItems: 'center' }, [
        slide.kind === 'cta'
          ? text(
              {
                backgroundColor: fg,
                color: bg,
                fontFamily: ctx.fonts.body,
                fontWeight: 700,
                fontSize: px(32 * s),
                padding: `${px(18 * s)} ${px(36 * s)}`,
                borderRadius: px(60 * s),
              },
              handleText(ctx),
            )
          : brandMark(ctx, 52 * s, fg),
        swipeHint(ctx, fg),
      ]),
    ])
  },
}

// Headline + Subtext: naslov i podnaslov sa akcentnom trakom, svetla podloga --------------------
const headline: StyleDef = {
  id: 'headline',
  group: 'type',
  fonts: { headings: 'brand', body: 'brand' },
  photo: 'none',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 88 * s
    const bg = ctx.colors.background
    const fg = readable(bg, ctx.colors.text)
    const accent = ctx.colors.primary
    const width = W(ctx, p) - 40 * s
    const titleSize = fit(slide.title, {
      max: 96 * s,
      min: 48 * s,
      width,
      height: ctx.size.height * 0.36 * tall(ctx),
      lineHeight: 1.06,
    })
    return root(ctx, { backgroundColor: bg, padding: px(p), color: fg, justifyContent: 'space-between' }, [
      topBar(ctx, mix(fg, bg, 0.45)),
      box({ gap: px(36 * s), alignItems: 'stretch' }, [
        el('div', { width: px(14 * s), backgroundColor: accent, borderRadius: px(8 * s) }),
        col({ gap: px(26 * s), width: px(width) }, [
          slide.kind === 'point'
            ? text(
                {
                  width: px(76 * s),
                  height: px(76 * s),
                  borderRadius: px(40 * s),
                  backgroundColor: accent,
                  color: readable(accent),
                  fontFamily: ctx.fonts.headings,
                  fontWeight: 700,
                  fontSize: px(32 * s),
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                pointNumber(ctx),
              )
            : text(
                {
                  fontFamily: ctx.fonts.body,
                  fontWeight: 700,
                  fontSize: px(26 * s),
                  letterSpacing: '3px',
                  textTransform: 'uppercase',
                  color: accent,
                },
                slide.kicker,
              ),
          text(
            {
              fontFamily: ctx.fonts.headings,
              fontWeight: 700,
              fontSize: px(titleSize),
              lineHeight: 1.06,
              letterSpacing: '-1px',
            },
            slide.title,
          ),
          text(
            { fontFamily: ctx.fonts.body, fontSize: px(34 * s), lineHeight: 1.4, color: mix(fg, bg, 0.3) },
            slide.body,
          ),
          slide.kind === 'cta'
            ? text(
                {
                  alignSelf: 'flex-start',
                  backgroundColor: accent,
                  color: readable(accent),
                  fontFamily: ctx.fonts.body,
                  fontWeight: 700,
                  fontSize: px(30 * s),
                  padding: `${px(16 * s)} ${px(34 * s)}`,
                  borderRadius: px(14 * s),
                },
                handleText(ctx),
              )
            : null,
        ]),
      ]),
      box({ justifyContent: 'space-between', alignItems: 'center' }, [
        brandMark(ctx, 46 * s, fg),
        swipeHint(ctx, accent),
      ]),
    ])
  },
}

// Quote Card: citat sa velikim navodnicima i potpisom --------------------------------------------
const quote: StyleDef = {
  id: 'quote',
  group: 'type',
  fonts: { headings: 'Playfair Display', body: 'brand' },
  photo: 'none',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 92 * s
    const bg = ctx.colors.background
    const fg = readable(bg, ctx.colors.text)
    const accent = ctx.colors.primary
    const isCta = slide.kind === 'cta'
    const titleSize = fit(slide.title, {
      max: 78 * s,
      min: 40 * s,
      width: W(ctx, p),
      height: ctx.size.height * 0.42 * tall(ctx),
      lineHeight: 1.2,
      charWidth: 0.5,
    })
    return root(ctx, { backgroundColor: bg, padding: px(p), color: fg, justifyContent: 'space-between' }, [
      topBar(ctx, mix(fg, bg, 0.45)),
      col({ gap: px(18 * s) }, [
        text(
          {
            fontFamily: ctx.fonts.headings,
            fontSize: px(220 * s),
            lineHeight: 0.8,
            color: accent,
            height: px(130 * s),
          },
          '“',
        ),
        text(
          { fontFamily: ctx.fonts.headings, fontSize: px(titleSize), lineHeight: 1.2, width: px(W(ctx, p)) },
          slide.title,
        ),
        box({ gap: px(18 * s), alignItems: 'center', marginTop: px(20 * s) }, [
          el('div', { width: px(56 * s), height: px(4 * s), backgroundColor: accent }),
          text(
            { fontFamily: ctx.fonts.body, fontSize: px(30 * s), color: mix(fg, bg, 0.3), fontWeight: 700 },
            isCta ? handleText(ctx) : (slide.body ?? ctx.brandName),
          ),
        ]),
      ]),
      box({ justifyContent: 'space-between', alignItems: 'center' }, [
        brandMark(ctx, 44 * s, fg),
        swipeHint(ctx, accent),
      ]),
    ])
  },
}

// Stat Highlight: jedan upečatljiv broj sa kratkim objašnjenjem ----------------------------------
const stat: StyleDef = {
  id: 'stat',
  group: 'type',
  fonts: { headings: 'brand', body: 'brand' },
  photo: 'none',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 88 * s
    const bg = ctx.colors.background
    const fg = readable(bg, ctx.colors.text)
    const accent = ctx.colors.primary
    const big =
      slide.kind === 'cta' ? null : (statValue(slide) ?? (slide.kind === 'point' ? pointNumber(ctx) : null))
    const titleSize = fit(slide.title, {
      max: (big ? 64 : 92) * s,
      min: 40 * s,
      width: W(ctx, p),
      height: ctx.size.height * (big ? 0.24 : 0.4) * tall(ctx),
      lineHeight: 1.12,
    })
    return root(ctx, { backgroundColor: bg, padding: px(p), color: fg, justifyContent: 'space-between' }, [
      topBar(ctx, mix(fg, bg, 0.45)),
      col({ gap: px(24 * s) }, [
        big
          ? text(
              {
                fontFamily: ctx.fonts.headings,
                fontWeight: 700,
                fontSize: px(
                  fit(big, {
                    max: 300 * s,
                    min: 120 * s,
                    width: W(ctx, p),
                    height: 320 * s,
                    lineHeight: 1,
                    charWidth: 0.6,
                  }),
                ),
                lineHeight: 1,
                letterSpacing: '-6px',
                color: accent,
              },
              big,
            )
          : text(
              {
                fontFamily: ctx.fonts.body,
                fontSize: px(26 * s),
                letterSpacing: '3px',
                textTransform: 'uppercase',
                color: accent,
              },
              slide.kicker,
            ),
        el('div', {
          width: px(120 * s),
          height: px(8 * s),
          backgroundColor: ctx.colors.secondary,
          borderRadius: px(4 * s),
        }),
        text(
          { fontFamily: ctx.fonts.headings, fontWeight: 700, fontSize: px(titleSize), lineHeight: 1.12 },
          slide.title,
        ),
        text(
          { fontFamily: ctx.fonts.body, fontSize: px(32 * s), lineHeight: 1.4, color: mix(fg, bg, 0.3) },
          slide.body,
        ),
      ]),
      box({ justifyContent: 'space-between', alignItems: 'center' }, [
        slide.kind === 'cta'
          ? text(
              { fontFamily: ctx.fonts.body, fontWeight: 700, fontSize: px(32 * s), color: accent },
              handleText(ctx),
            )
          : brandMark(ctx, 44 * s, fg),
        swipeHint(ctx, accent),
      ]),
    ])
  },
}

// List Slide: numerisan slajd, za savete i liste --------------------------------------------------
const list: StyleDef = {
  id: 'list',
  group: 'type',
  fonts: { headings: 'brand', body: 'brand' },
  photo: 'none',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 84 * s
    const bg = ctx.colors.background
    const fg = readable(bg, ctx.colors.text)
    const accent = ctx.colors.primary
    const items = slide.kind === 'point' ? listItems(slide) : []
    const useItems = items.length >= 2
    const titleSize = fit(slide.title, {
      max: (slide.kind === 'cover' ? 96 : 70) * s,
      min: 42 * s,
      width: W(ctx, p) - (slide.kind === 'point' ? 150 * s : 0),
      height: ctx.size.height * 0.3 * tall(ctx),
      lineHeight: 1.08,
    })
    const check = (label: string, i: number) =>
      box({ gap: px(22 * s), alignItems: 'flex-start' }, [
        text(
          {
            width: px(48 * s),
            height: px(48 * s),
            borderRadius: px(12 * s),
            backgroundColor: alpha(accent, 0.14),
            color: accent,
            fontFamily: ctx.fonts.headings,
            fontWeight: 700,
            fontSize: px(26 * s),
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          },
          String(i + 1),
        ),
        text(
          {
            fontFamily: ctx.fonts.body,
            fontSize: px(32 * s),
            lineHeight: 1.35,
            width: px(W(ctx, p) - 80 * s),
          },
          label,
        ),
      ])
    const main =
      slide.kind === 'point'
        ? box({ gap: px(36 * s), alignItems: 'flex-start' }, [
            text(
              {
                fontFamily: ctx.fonts.headings,
                fontWeight: 700,
                fontSize: px(120 * s),
                lineHeight: 0.9,
                color: accent,
                width: px(130 * s),
              },
              pointNumber(ctx),
            ),
            col({ gap: px(22 * s), width: px(W(ctx, p) - 166 * s) }, [
              text(
                {
                  fontFamily: ctx.fonts.headings,
                  fontWeight: 700,
                  fontSize: px(titleSize),
                  lineHeight: 1.08,
                },
                slide.title,
              ),
              useItems
                ? null
                : text(
                    {
                      fontFamily: ctx.fonts.body,
                      fontSize: px(32 * s),
                      lineHeight: 1.4,
                      color: mix(fg, bg, 0.3),
                    },
                    slide.body,
                  ),
            ]),
          ])
        : col({ gap: px(24 * s) }, [
            text(
              {
                fontFamily: ctx.fonts.body,
                fontWeight: 700,
                fontSize: px(26 * s),
                letterSpacing: '3px',
                textTransform: 'uppercase',
                color: accent,
              },
              slide.kicker,
            ),
            text(
              { fontFamily: ctx.fonts.headings, fontWeight: 700, fontSize: px(titleSize), lineHeight: 1.08 },
              slide.title,
            ),
            text(
              { fontFamily: ctx.fonts.body, fontSize: px(32 * s), lineHeight: 1.4, color: mix(fg, bg, 0.3) },
              slide.body,
            ),
          ])
    return root(ctx, { backgroundColor: bg, padding: px(p), color: fg, justifyContent: 'space-between' }, [
      topBar(ctx, mix(fg, bg, 0.45)),
      col({ gap: px(36 * s) }, [main, useItems ? col({ gap: px(22 * s) }, items.map(check)) : null]),
      box({ justifyContent: 'space-between', alignItems: 'center' }, [
        slide.kind === 'cta'
          ? text(
              { fontFamily: ctx.fonts.body, fontWeight: 700, fontSize: px(32 * s), color: accent },
              handleText(ctx),
            )
          : brandMark(ctx, 44 * s, fg),
        swipeHint(ctx, accent),
      ]),
    ])
  },
}

// Minimal Mono: mnogo belog prostora, suptilan i premium ton bez fotografije ----------------------
const mono: StyleDef = {
  id: 'mono',
  group: 'type',
  fonts: { headings: 'Inter', body: 'JetBrains Mono' },
  ownFonts: true,
  photo: 'none',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 100 * s
    const bg = isDark(ctx.colors.background) ? '#fafafa' : ctx.colors.background
    const fg = '#111111'
    const titleSize = fit(slide.title, {
      max: 72 * s,
      min: 40 * s,
      width: W(ctx, p) * 0.85,
      height: ctx.size.height * 0.3 * tall(ctx),
      lineHeight: 1.12,
    })
    const label = {
      fontFamily: ctx.fonts.body,
      fontSize: px(22 * s),
      letterSpacing: '2px',
      textTransform: 'uppercase',
      color: '#8a8a8a',
    }
    return root(ctx, { backgroundColor: bg, padding: px(p), color: fg, justifyContent: 'space-between' }, [
      box({ justifyContent: 'space-between' }, [
        text(label, slide.kind === 'point' ? `${pointNumber(ctx)} —` : (slide.kicker ?? ctx.brandName)),
        text(label, counterText(ctx)),
      ]),
      col({ gap: px(30 * s) }, [
        text(
          {
            fontFamily: ctx.fonts.headings,
            fontWeight: 700,
            fontSize: px(titleSize),
            lineHeight: 1.12,
            letterSpacing: '-1.5px',
            width: px(W(ctx, p) * 0.85),
          },
          slide.title,
        ),
        el('div', { width: px(80 * s), height: px(2 * s), backgroundColor: ctx.colors.primary }),
        text(
          {
            fontFamily: ctx.fonts.body,
            fontSize: px(26 * s),
            lineHeight: 1.6,
            color: '#555555',
            width: px(W(ctx, p) * 0.8),
          },
          slide.body,
        ),
      ]),
      box({ justifyContent: 'space-between', alignItems: 'center' }, [
        text(label, handleText(ctx)),
        ctx.total > 1 && ctx.index === 0 ? text(label, '→') : null,
      ]),
    ])
  },
}

// Kartice: sadržaj u preglednim karticama ----------------------------------------------------------
const cards: StyleDef = {
  id: 'cards',
  group: 'type',
  fonts: { headings: 'brand', body: 'brand' },
  photo: 'cover',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 64 * s
    const bg = mix(ctx.colors.background, ctx.colors.primary, isDark(ctx.colors.background) ? 0.2 : 0.08)
    const card = isDark(ctx.colors.background) ? mix(ctx.colors.background, '#ffffff', 0.08) : '#ffffff'
    const fg = readable(card, ctx.colors.text)
    const accent = ctx.colors.primary
    const inner = W(ctx, p) - 112 * s
    const hasPhoto = Boolean(ctx.photo)
    const titleSize = fit(slide.title, {
      max: 76 * s,
      min: 40 * s,
      width: inner,
      height: ctx.size.height * (hasPhoto ? 0.2 : 0.32) * tall(ctx),
      lineHeight: 1.1,
    })
    return root(ctx, { backgroundColor: bg, padding: px(p), justifyContent: 'space-between' }, [
      topBar(ctx, mix(readable(bg), bg, 0.35)),
      col(
        {
          backgroundColor: card,
          borderRadius: px(40 * s),
          padding: px(56 * s),
          gap: px(24 * s),
          boxShadow: `0 ${px(18 * s)} ${px(50 * s)} ${alpha('#000000', 0.12)}`,
          color: fg,
        },
        [
          hasPhoto
            ? img(ctx.photo!, {
                width: px(inner),
                height: px(ctx.size.height * 0.3),
                objectFit: 'cover',
                borderRadius: px(26 * s),
              })
            : null,
          box({ gap: px(14 * s), alignItems: 'center' }, [
            text(
              {
                backgroundColor: alpha(accent, 0.14),
                color: accent,
                fontFamily: ctx.fonts.body,
                fontWeight: 700,
                fontSize: px(22 * s),
                padding: `${px(8 * s)} ${px(18 * s)}`,
                borderRadius: px(30 * s),
                letterSpacing: '1px',
                textTransform: 'uppercase',
              },
              slide.kind === 'point' ? pointNumber(ctx) : (slide.kicker ?? ctx.brandName),
            ),
          ]),
          text(
            { fontFamily: ctx.fonts.headings, fontWeight: 700, fontSize: px(titleSize), lineHeight: 1.1 },
            slide.title,
          ),
          text(
            { fontFamily: ctx.fonts.body, fontSize: px(30 * s), lineHeight: 1.4, color: mix(fg, card, 0.32) },
            slide.body,
          ),
          slide.kind === 'cta'
            ? text(
                {
                  alignSelf: 'flex-start',
                  backgroundColor: accent,
                  color: readable(accent),
                  fontFamily: ctx.fonts.body,
                  fontWeight: 700,
                  fontSize: px(28 * s),
                  padding: `${px(14 * s)} ${px(30 * s)}`,
                  borderRadius: px(14 * s),
                },
                handleText(ctx),
              )
            : null,
        ],
      ),
      box({ justifyContent: 'space-between', alignItems: 'center' }, [
        brandMark(ctx, 40 * s, readable(bg)),
        swipeHint(ctx, accent),
      ]),
    ])
  },
}

// Linen: topao uredački stil sa organskim detaljima -----------------------------------------------
const linen: StyleDef = {
  id: 'linen',
  group: 'type',
  fonts: { headings: 'Playfair Display', body: 'brand' },
  photo: 'none',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 96 * s
    const bg = mix('#f4eee4', ctx.colors.primary, 0.05)
    const fg = '#2b2622'
    const accent = mix(ctx.colors.primary, '#2b2622', 0.15)
    const titleSize = fit(slide.title, {
      max: 86 * s,
      min: 44 * s,
      width: W(ctx, p),
      height: ctx.size.height * 0.36 * tall(ctx),
      lineHeight: 1.12,
      charWidth: 0.5,
    })
    return root(ctx, { backgroundColor: bg, padding: px(p), color: fg, justifyContent: 'space-between' }, [
      el('div', {
        position: 'absolute',
        right: px(-160 * s),
        top: px(-120 * s),
        width: px(520 * s),
        height: px(520 * s),
        borderRadius: px(260 * s),
        backgroundColor: alpha(ctx.colors.secondary, 0.12),
      }),
      el('div', {
        position: 'absolute',
        left: px(28 * s),
        top: px(28 * s),
        right: px(28 * s),
        bottom: px(28 * s),
        border: `${px(2 * s)} solid ${alpha(fg, 0.18)}`,
        borderRadius: px(18 * s),
      }),
      topBar(ctx, alpha(fg, 0.55)),
      col({ gap: px(26 * s) }, [
        text(
          {
            fontFamily: ctx.fonts.body,
            fontSize: px(24 * s),
            letterSpacing: '4px',
            textTransform: 'uppercase',
            color: accent,
          },
          slide.kind === 'point' ? `${pointNumber(ctx)} ·` : slide.kicker,
        ),
        text({ fontFamily: ctx.fonts.headings, fontSize: px(titleSize), lineHeight: 1.12 }, slide.title),
        text(
          { fontFamily: ctx.fonts.body, fontSize: px(30 * s), lineHeight: 1.5, color: alpha(fg, 0.75) },
          slide.body,
        ),
      ]),
      box({ justifyContent: 'space-between', alignItems: 'center' }, [
        text({ fontFamily: ctx.fonts.headings, fontSize: px(32 * s), color: accent }, handleText(ctx)),
        swipeHint(ctx, accent),
      ]),
    ])
  },
}

// Prism: premium minimalistički stil sa prelivima boja brenda -------------------------------------
const prism: StyleDef = {
  id: 'prism',
  group: 'type',
  fonts: { headings: 'brand', body: 'brand' },
  photo: 'none',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 90 * s
    const bg = '#ffffff'
    const fg = readable(bg, ctx.colors.text)
    const titleSize = fit(slide.title, {
      max: 88 * s,
      min: 44 * s,
      width: W(ctx, p),
      height: ctx.size.height * 0.34 * tall(ctx),
      lineHeight: 1.08,
    })
    const progress = ctx.total > 1 ? (ctx.index + 1) / ctx.total : 1
    return root(ctx, { backgroundColor: bg, padding: px(p), color: fg, justifyContent: 'space-between' }, [
      el('div', {
        position: 'absolute',
        left: px(-240 * s),
        bottom: px(-260 * s),
        width: px(900 * s),
        height: px(900 * s),
        backgroundImage: `radial-gradient(circle, ${alpha(ctx.colors.primary, 0.34)} 0%, ${alpha(ctx.colors.secondary, 0.16)} 45%, ${alpha('#ffffff', 0)} 70%)`,
      }),
      topBar(ctx, mix(fg, bg, 0.45)),
      col({ gap: px(26 * s) }, [
        text(
          {
            fontFamily: ctx.fonts.body,
            fontWeight: 700,
            fontSize: px(24 * s),
            letterSpacing: '3px',
            textTransform: 'uppercase',
            color: ctx.colors.primary,
          },
          slide.kind === 'point' ? pointNumber(ctx) : slide.kicker,
        ),
        text(
          {
            fontFamily: ctx.fonts.headings,
            fontWeight: 700,
            fontSize: px(titleSize),
            lineHeight: 1.08,
            letterSpacing: '-1px',
          },
          slide.title,
        ),
        el('div', {
          width: px(180 * s),
          height: px(8 * s),
          borderRadius: px(4 * s),
          backgroundImage: `linear-gradient(90deg, ${ctx.colors.primary}, ${ctx.colors.secondary})`,
        }),
        text(
          { fontFamily: ctx.fonts.body, fontSize: px(32 * s), lineHeight: 1.45, color: mix(fg, bg, 0.3) },
          slide.body,
        ),
      ]),
      col({ gap: px(26 * s) }, [
        box({ justifyContent: 'space-between', alignItems: 'center' }, [
          slide.kind === 'cta'
            ? text(
                {
                  fontFamily: ctx.fonts.body,
                  fontWeight: 700,
                  fontSize: px(30 * s),
                  color: ctx.colors.primary,
                },
                handleText(ctx),
              )
            : brandMark(ctx, 42 * s, fg),
          swipeHint(ctx, ctx.colors.primary),
        ]),
        box({ height: px(6 * s), backgroundColor: alpha(fg, 0.08), borderRadius: px(3 * s) }, [
          el('div', {
            width: px((ctx.size.width - p * 2) * progress),
            height: px(6 * s),
            borderRadius: px(3 * s),
            backgroundImage: `linear-gradient(90deg, ${ctx.colors.primary}, ${ctx.colors.secondary})`,
          }),
        ]),
      ]),
    ])
  },
}

// Pop Card: razigran stil sa zaobljenim karticama i debelim okvirom -------------------------------
const popcard: StyleDef = {
  id: 'popcard',
  group: 'type',
  fonts: { headings: 'brand', body: 'brand' },
  photo: 'none',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 70 * s
    const bg = mix(ctx.colors.secondary, '#ffffff', 0.72)
    const ink = '#141414'
    const card = '#ffffff'
    const inner = W(ctx, p) - 120 * s
    const titleSize = fit(slide.title, {
      max: 84 * s,
      min: 42 * s,
      width: inner,
      height: ctx.size.height * 0.32 * tall(ctx),
      lineHeight: 1.06,
    })
    return root(ctx, { backgroundColor: bg, padding: px(p), justifyContent: 'center', color: ink }, [
      col(
        {
          position: 'relative',
          backgroundColor: card,
          border: `${px(6 * s)} solid ${ink}`,
          borderRadius: px(48 * s),
          padding: px(60 * s),
          gap: px(26 * s),
          boxShadow: `${px(16 * s)} ${px(16 * s)} 0 ${ink}`,
          minHeight: px(ctx.size.height * 0.62),
          justifyContent: 'space-between',
        },
        [
          box({ justifyContent: 'space-between', alignItems: 'center' }, [
            text(
              {
                backgroundColor: ctx.colors.primary,
                color: readable(ctx.colors.primary),
                fontFamily: ctx.fonts.body,
                fontWeight: 700,
                fontSize: px(24 * s),
                padding: `${px(10 * s)} ${px(22 * s)}`,
                borderRadius: px(30 * s),
                border: `${px(4 * s)} solid ${ink}`,
              },
              slide.kind === 'point' ? `#${pointNumber(ctx)}` : (slide.kicker ?? handleText(ctx)),
            ),
            text({ fontFamily: ctx.fonts.body, fontSize: px(24 * s), fontWeight: 700 }, counterText(ctx)),
          ]),
          col({ gap: px(22 * s) }, [
            text(
              {
                fontFamily: ctx.fonts.headings,
                fontWeight: 700,
                fontSize: px(titleSize),
                lineHeight: 1.06,
                letterSpacing: '-1px',
              },
              slide.title,
            ),
            text(
              { fontFamily: ctx.fonts.body, fontSize: px(31 * s), lineHeight: 1.4, color: '#3a3a3a' },
              slide.body,
            ),
          ]),
          box({ justifyContent: 'space-between', alignItems: 'center' }, [
            text({ fontFamily: ctx.fonts.body, fontWeight: 700, fontSize: px(28 * s) }, handleText(ctx)),
            ctx.total > 1 && ctx.index < ctx.total - 1
              ? text(
                  {
                    width: px(76 * s),
                    height: px(76 * s),
                    borderRadius: px(40 * s),
                    backgroundColor: ink,
                    color: '#ffffff',
                    fontSize: px(36 * s),
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                  '→',
                )
              : null,
          ]),
        ],
      ),
    ])
  },
}

// Beleška: stranica iz notesa, linije, rukom pisan naslov i zalepljena fotografija ----------------
const note: StyleDef = {
  id: 'note',
  group: 'type',
  fonts: { headings: 'Caveat', body: 'brand' },
  ownFonts: true,
  photo: 'cover',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 90 * s
    const paper = '#fdfcf7'
    const ink = '#22201c'
    const lineGap = 54 * s
    const lines = Array.from({ length: Math.ceil(ctx.size.height / lineGap) }, (_, i) =>
      el('div', {
        position: 'absolute',
        left: 0,
        right: 0,
        top: px(120 * s + i * lineGap),
        height: px(2 * s),
        backgroundColor: alpha('#6a8fb8', 0.18),
      }),
    )
    const hasPhoto = Boolean(ctx.photo) && slide.kind === 'cover'
    const titleSize = fit(slide.title, {
      max: 104 * s,
      min: 56 * s,
      width: W(ctx, p) - 40 * s,
      height: ctx.size.height * (hasPhoto ? 0.24 : 0.36) * tall(ctx),
      lineHeight: 1.05,
      charWidth: 0.42,
    })
    return root(
      ctx,
      {
        backgroundColor: paper,
        padding: px(p),
        paddingLeft: px(p + 40 * s),
        color: ink,
        justifyContent: 'space-between',
      },
      [
        ...lines,
        el('div', {
          position: 'absolute',
          left: px(96 * s),
          top: 0,
          bottom: 0,
          width: px(3 * s),
          backgroundColor: alpha('#d9534f', 0.45),
        }),
        topBar(ctx, alpha(ink, 0.5)),
        col({ gap: px(22 * s) }, [
          box({ gap: px(18 * s), alignItems: 'center' }, [
            box(
              {
                width: px(64 * s),
                height: px(64 * s),
                borderRadius: px(32 * s),
                border: `${px(3 * s)} solid ${ctx.colors.primary}`,
                color: ctx.colors.primary,
                fontFamily: ctx.fonts.headings,
                fontSize: px(40 * s),
                alignItems: 'center',
                justifyContent: 'center',
              },
              slide.kind === 'point'
                ? String(Math.max(1, ctx.index))
                : icon('check', 34 * s, ctx.colors.primary, 3),
            ),
            text(
              {
                fontFamily: ctx.fonts.body,
                fontSize: px(24 * s),
                color: ctx.colors.primary,
                fontWeight: 700,
              },
              slide.kicker,
            ),
          ]),
          text(
            {
              fontFamily: ctx.fonts.headings,
              fontSize: px(titleSize),
              lineHeight: 1.05,
              width: px(W(ctx, p) - 40 * s),
            },
            slide.title,
          ),
          text(
            {
              fontFamily: ctx.fonts.body,
              fontSize: px(30 * s),
              lineHeight: 1.6,
              color: alpha(ink, 0.78),
              width: px(W(ctx, p) - 60 * s),
            },
            slide.body,
          ),
        ]),
        hasPhoto
          ? box({ justifyContent: 'flex-end' }, [
              box(
                {
                  position: 'relative',
                  padding: px(14 * s),
                  backgroundColor: '#ffffff',
                  boxShadow: `0 ${px(10 * s)} ${px(24 * s)} ${alpha('#000000', 0.15)}`,
                  transform: 'rotate(3deg)',
                },
                [
                  img(ctx.photo!, { width: px(420 * s), height: px(300 * s), objectFit: 'cover' }),
                  el('div', {
                    position: 'absolute',
                    top: px(-18 * s),
                    left: px(150 * s),
                    width: px(130 * s),
                    height: px(38 * s),
                    backgroundColor: alpha('#f3e3a6', 0.85),
                    transform: 'rotate(-4deg)',
                  }),
                ],
              ),
            ])
          : box({ justifyContent: 'space-between', alignItems: 'center' }, [
              text(
                { fontFamily: ctx.fonts.headings, fontSize: px(42 * s), color: ctx.colors.primary },
                handleText(ctx),
              ),
              swipeHint(ctx, ctx.colors.primary),
            ]),
      ],
    )
  },
}

// Pamflet: letterpress plakat, gusta kondenzovana slova i crveni akcenti --------------------------
const pamphlet: StyleDef = {
  id: 'pamphlet',
  group: 'type',
  fonts: { headings: 'Oswald', body: 'JetBrains Mono' },
  ownFonts: true,
  photo: 'cover',
  photoTreatment: 'grayscale',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 72 * s
    const paper = '#efe8da'
    const ink = '#171513'
    const red = ctx.colors.primary
    const hasPhoto = Boolean(ctx.photo)
    const titleSize = fit(slide.title.toUpperCase(), {
      max: 128 * s,
      min: 56 * s,
      width: W(ctx, p),
      height: ctx.size.height * (hasPhoto ? 0.26 : 0.42) * tall(ctx),
      lineHeight: 0.98,
      charWidth: 0.46,
    })
    const rule = (h: number) => el('div', { height: px(h * s), backgroundColor: ink })
    return root(
      ctx,
      {
        backgroundColor: paper,
        backgroundImage: `radial-gradient(${alpha(ink, 0.07)} ${px(1.4 * s)}, ${alpha(paper, 0)} ${px(1.6 * s)})`,
        backgroundSize: `${px(9 * s)} ${px(9 * s)}`,
        padding: px(p),
        color: ink,
        justifyContent: 'space-between',
      },
      [
        col({ gap: px(10 * s) }, [
          rule(8),
          box(
            {
              justifyContent: 'space-between',
              fontFamily: ctx.fonts.body,
              fontSize: px(22 * s),
              letterSpacing: '2px',
              textTransform: 'uppercase',
            },
            [text({}, handleText(ctx)), text({}, counterText(ctx) ?? ctx.brandName)],
          ),
          rule(2),
        ]),
        hasPhoto
          ? img(ctx.photo!, {
              width: px(W(ctx, p)),
              height: px(ctx.size.height * 0.32),
              objectFit: 'cover',
              border: `${px(4 * s)} solid ${ink}`,
            })
          : null,
        col({ gap: px(18 * s) }, [
          text(
            {
              fontFamily: ctx.fonts.body,
              fontSize: px(24 * s),
              letterSpacing: '3px',
              textTransform: 'uppercase',
              color: red,
              fontWeight: 700,
            },
            slide.kind === 'point' ? `Br. ${pointNumber(ctx)}` : slide.kicker,
          ),
          text(
            {
              fontFamily: ctx.fonts.headings,
              fontWeight: 700,
              fontSize: px(titleSize),
              lineHeight: 0.98,
              textTransform: 'uppercase',
              letterSpacing: '-1px',
            },
            slide.title,
          ),
          el('div', { width: px(160 * s), height: px(10 * s), backgroundColor: red }),
          text({ fontFamily: ctx.fonts.body, fontSize: px(26 * s), lineHeight: 1.5 }, slide.body),
        ]),
        col({ gap: px(10 * s) }, [
          rule(2),
          box({ justifyContent: 'space-between', alignItems: 'center' }, [
            text(
              {
                fontFamily: ctx.fonts.headings,
                fontSize: px(34 * s),
                fontWeight: 700,
                textTransform: 'uppercase',
              },
              ctx.brandName,
            ),
            swipeHint(ctx, red),
          ]),
        ]),
      ],
    )
  },
}

export const TYPE_STYLES: StyleDef[] = [
  bold,
  headline,
  quote,
  stat,
  list,
  mono,
  cards,
  linen,
  prism,
  popcard,
  note,
  pamphlet,
]

/** Za testove: da svaki stil zna da nacrta svaki slajd. */
export type { Slide }
