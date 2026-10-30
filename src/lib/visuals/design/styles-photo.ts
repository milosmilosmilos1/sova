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
  mix,
  pointNumber,
  px,
  readable,
  sc,
  swipeHint,
  text,
  topBar,
  layered,
} from './kit'
import type { DesignContext, StyleDef } from './types'

/**
 * Stilovi sa fotografijom (D-108). Fotografija dolazi sa Unsplash-a, Pexels-a ili iz galerije
 * brenda, nikad iz AI-ja. Kad je nema, stil pada na preliv u bojama brenda.
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

/** Fotografija preko celog platna ili preliv u bojama brenda. */
function backdrop(ctx: DesignContext, fallback?: string) {
  if (ctx.photo)
    return img(ctx.photo, {
      position: 'absolute',
      left: 0,
      top: 0,
      width: px(ctx.size.width),
      height: px(ctx.size.height),
      objectFit: 'cover',
    })
  return el('div', {
    position: 'absolute',
    left: 0,
    top: 0,
    width: px(ctx.size.width),
    height: px(ctx.size.height),
    backgroundImage:
      fallback ??
      `linear-gradient(150deg, ${ctx.colors.primary} 0%, ${mix(ctx.colors.secondary, '#000000', 0.35)} 100%)`,
  })
}

const shade = (ctx: DesignContext, from: number, to: number) =>
  el('div', {
    position: 'absolute',
    left: 0,
    top: 0,
    width: px(ctx.size.width),
    height: px(ctx.size.height),
    backgroundImage: `linear-gradient(180deg, ${alpha('#000000', from)} 0%, ${alpha('#000000', from)} 35%, ${alpha('#000000', to)} 100%)`,
  })

// Poster: fotografija preko celog kadra, tamni preliv i naslov pri dnu ----------------------------
const poster: StyleDef = {
  id: 'poster',
  group: 'photo',
  fonts: { headings: 'brand', body: 'brand' },
  photo: 'all',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 72 * s
    const titleSize = fit(slide.title.toUpperCase(), {
      max: 92 * s,
      min: 44 * s,
      width: W(ctx, p),
      height: ctx.size.height * 0.28 * tall(ctx),
      lineHeight: 1.02,
      charWidth: 0.62,
    })
    return root(ctx, { padding: px(p), color: '#ffffff', justifyContent: 'space-between' }, [
      backdrop(ctx),
      shade(ctx, 0.15, 0.85),
      topBar(ctx, alpha('#ffffff', 0.85)),
      col({ gap: px(20 * s) }, [
        text(
          {
            fontFamily: ctx.fonts.body,
            fontWeight: 700,
            fontSize: px(24 * s),
            letterSpacing: '3px',
            textTransform: 'uppercase',
            color: mix(ctx.colors.primary, '#ffffff', 0.35),
          },
          slide.kicker,
        ),
        text(
          {
            fontFamily: ctx.fonts.headings,
            fontWeight: 700,
            fontSize: px(titleSize),
            lineHeight: 1.02,
            textTransform: 'uppercase',
            width: px(W(ctx, p)),
          },
          slide.title,
        ),
        text(
          {
            fontFamily: ctx.fonts.body,
            fontSize: px(30 * s),
            lineHeight: 1.4,
            color: alpha('#ffffff', 0.88),
            width: px(W(ctx, p) * 0.85),
          },
          slide.body,
        ),
        box({ justifyContent: 'space-between', alignItems: 'flex-end' }, [
          slide.kind === 'cta'
            ? text(
                {
                  backgroundColor: ctx.colors.primary,
                  color: readable(ctx.colors.primary),
                  fontFamily: ctx.fonts.body,
                  fontWeight: 700,
                  fontSize: px(28 * s),
                  padding: `${px(14 * s)} ${px(30 * s)}`,
                  borderRadius: px(40 * s),
                },
                handleText(ctx),
              )
            : swipeHint(ctx, '#ffffff'),
          ctx.total > 1
            ? text(
                {
                  fontFamily: ctx.fonts.headings,
                  fontWeight: 700,
                  fontSize: px(150 * s),
                  lineHeight: 0.85,
                  color: alpha('#ffffff', 0.18),
                },
                String(ctx.index + 1).padStart(2, '0'),
              )
            : null,
        ]),
      ]),
    ])
  },
}

// Editorial: uramljena fotografija i naslov sa belim prostorom ------------------------------------
const editorial: StyleDef = {
  id: 'editorial',
  group: 'photo',
  fonts: { headings: 'Playfair Display', body: 'brand' },
  photo: 'cover',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 72 * s
    const bg = '#ffffff'
    const fg = '#151515'
    const accent = ctx.colors.primary
    const hasPhoto = Boolean(ctx.photo)
    const photoH = ctx.size.height * (ctx.format === 'story' ? 0.42 : ctx.format === 'square' ? 0.36 : 0.42)
    const titleSize = fit(slide.title, {
      max: 78 * s,
      min: 40 * s,
      width: W(ctx, p),
      height: ctx.size.height * (hasPhoto ? 0.2 : 0.36) * tall(ctx),
      lineHeight: 1.1,
      charWidth: 0.5,
    })
    return root(ctx, { backgroundColor: bg, padding: px(p), color: fg, justifyContent: 'space-between' }, [
      text(
        {
          position: 'absolute',
          right: px(40 * s),
          bottom: px(-30 * s),
          fontFamily: ctx.fonts.headings,
          fontSize: px(330 * s),
          lineHeight: 1,
          color: alpha(accent, 0.1),
        },
        ctx.total > 1 ? String(ctx.index + 1).padStart(2, '0') : null,
      ),
      topBar(ctx, '#7a7a7a', { size: 22 }),
      hasPhoto ? img(ctx.photo!, { width: px(W(ctx, p)), height: px(photoH), objectFit: 'cover' }) : null,
      col({ gap: px(20 * s) }, [
        box({ gap: px(14 * s), alignItems: 'center' }, [
          el('div', { width: px(40 * s), height: px(3 * s), backgroundColor: accent }),
          text(
            {
              fontFamily: ctx.fonts.body,
              fontWeight: 700,
              fontSize: px(22 * s),
              letterSpacing: '3px',
              textTransform: 'uppercase',
              color: accent,
            },
            slide.kind === 'point' ? pointNumber(ctx) : (slide.kicker ?? ctx.brandName),
          ),
        ]),
        text(
          { fontFamily: ctx.fonts.headings, fontSize: px(titleSize), lineHeight: 1.1, width: px(W(ctx, p)) },
          slide.title,
        ),
        text(
          {
            fontFamily: ctx.fonts.body,
            fontSize: px(28 * s),
            lineHeight: 1.5,
            color: '#555555',
            width: px(W(ctx, p) * 0.9),
          },
          slide.body,
        ),
      ]),
      box({ justifyContent: 'space-between', alignItems: 'center' }, [
        slide.kind === 'cta'
          ? text({ fontFamily: ctx.fonts.headings, fontSize: px(34 * s), color: accent }, handleText(ctx))
          : brandMark(ctx, 40 * s, fg),
        swipeHint(ctx, accent),
      ]),
    ])
  },
}

// Cover: fotografija preko celog kadra sa trakom naslova pri dnu ----------------------------------
const cover: StyleDef = {
  id: 'cover',
  group: 'photo',
  fonts: { headings: 'brand', body: 'brand' },
  photo: 'all',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 64 * s
    const band = alpha(mix(ctx.colors.text, '#000000', 0.4), 0.82)
    const titleSize = fit(slide.title, {
      max: 72 * s,
      min: 38 * s,
      width: W(ctx, p) - 80 * s,
      height: ctx.size.height * 0.2 * tall(ctx),
      lineHeight: 1.08,
    })
    return root(ctx, { padding: px(p), color: '#ffffff', justifyContent: 'space-between' }, [
      backdrop(ctx),
      shade(ctx, 0.25, 0.25),
      topBar(ctx, '#ffffff'),
      col(
        {
          backgroundColor: band,
          padding: `${px(44 * s)} ${px(40 * s)}`,
          gap: px(18 * s),
          borderLeft: `${px(10 * s)} solid ${ctx.colors.primary}`,
        },
        [
          text(
            {
              fontFamily: ctx.fonts.body,
              fontWeight: 700,
              fontSize: px(22 * s),
              letterSpacing: '3px',
              textTransform: 'uppercase',
              color: mix(ctx.colors.primary, '#ffffff', 0.4),
            },
            slide.kind === 'point' ? pointNumber(ctx) : slide.kicker,
          ),
          text(
            { fontFamily: ctx.fonts.headings, fontWeight: 700, fontSize: px(titleSize), lineHeight: 1.08 },
            slide.title,
          ),
          text(
            {
              fontFamily: ctx.fonts.body,
              fontSize: px(28 * s),
              lineHeight: 1.4,
              color: alpha('#ffffff', 0.85),
            },
            slide.body,
          ),
          slide.kind === 'cta'
            ? text(
                {
                  fontFamily: ctx.fonts.body,
                  fontWeight: 700,
                  fontSize: px(28 * s),
                  color: mix(ctx.colors.primary, '#ffffff', 0.4),
                },
                handleText(ctx),
              )
            : null,
        ],
      ),
    ])
  },
}

// Duotone: fotografija sa jakim tonom boje brenda --------------------------------------------------
const duotone: StyleDef = {
  id: 'duotone',
  group: 'photo',
  fonts: { headings: 'brand', body: 'brand' },
  photo: 'all',
  photoTreatment: 'duotone',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 80 * s
    const titleSize = fit(slide.title, {
      max: 104 * s,
      min: 48 * s,
      width: W(ctx, p),
      height: ctx.size.height * 0.36 * tall(ctx),
      lineHeight: 1.02,
    })
    return root(ctx, { padding: px(p), color: '#ffffff', justifyContent: 'space-between' }, [
      backdrop(ctx),
      el('div', {
        position: 'absolute',
        left: 0,
        top: 0,
        width: px(ctx.size.width),
        height: px(ctx.size.height),
        backgroundImage: `linear-gradient(160deg, ${alpha(ctx.colors.primary, 0.55)} 0%, ${alpha(mix(ctx.colors.secondary, '#000000', 0.5), 0.75)} 100%)`,
      }),
      topBar(ctx, alpha('#ffffff', 0.9)),
      col({ gap: px(24 * s) }, [
        text(
          {
            fontFamily: ctx.fonts.body,
            fontWeight: 700,
            fontSize: px(26 * s),
            letterSpacing: '4px',
            textTransform: 'uppercase',
          },
          slide.kind === 'point' ? pointNumber(ctx) : slide.kicker,
        ),
        text(
          {
            fontFamily: ctx.fonts.headings,
            fontWeight: 700,
            fontSize: px(titleSize),
            lineHeight: 1.02,
            letterSpacing: '-1.5px',
            width: px(W(ctx, p)),
          },
          slide.title,
        ),
        text(
          {
            fontFamily: ctx.fonts.body,
            fontSize: px(32 * s),
            lineHeight: 1.4,
            color: alpha('#ffffff', 0.9),
            width: px(W(ctx, p) * 0.88),
          },
          slide.body,
        ),
      ]),
      box({ justifyContent: 'space-between', alignItems: 'center' }, [
        slide.kind === 'cta'
          ? text(
              {
                backgroundColor: '#ffffff',
                color: ctx.colors.primary,
                fontFamily: ctx.fonts.body,
                fontWeight: 700,
                fontSize: px(30 * s),
                padding: `${px(16 * s)} ${px(34 * s)}`,
                borderRadius: px(50 * s),
              },
              handleText(ctx),
            )
          : brandMark(ctx, 46 * s, '#ffffff'),
        swipeHint(ctx, '#ffffff'),
      ]),
    ])
  },
}

// Framed: uramljena fotografija sa trakom naslova u boji brenda -----------------------------------
const framed: StyleDef = {
  id: 'framed',
  group: 'photo',
  fonts: { headings: 'brand', body: 'brand' },
  photo: 'all',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 64 * s
    const bg = ctx.colors.background
    const strip = ctx.colors.primary
    const onStrip = readable(strip)
    const photoH = ctx.size.height * 0.56
    const titleSize = fit(slide.title, {
      max: 66 * s,
      min: 36 * s,
      width: W(ctx, p) - 100 * s,
      height: ctx.size.height * 0.16 * tall(ctx),
      lineHeight: 1.08,
    })
    return root(ctx, { backgroundColor: bg, padding: px(p), justifyContent: 'space-between' }, [
      topBar(ctx, mix(readable(bg), bg, 0.4)),
      col({ position: 'relative' }, [
        box(
          {
            backgroundColor: '#ffffff',
            padding: px(18 * s),
            boxShadow: `0 ${px(14 * s)} ${px(40 * s)} ${alpha('#000000', 0.18)}`,
          },
          [
            ctx.photo
              ? img(ctx.photo, { width: px(W(ctx, p) - 36 * s), height: px(photoH), objectFit: 'cover' })
              : el('div', {
                  width: px(W(ctx, p) - 36 * s),
                  height: px(photoH),
                  backgroundImage: `linear-gradient(135deg, ${mix(strip, '#ffffff', 0.5)}, ${ctx.colors.secondary})`,
                }),
          ],
        ),
        col(
          {
            marginTop: px(-90 * s),
            marginLeft: px(36 * s),
            marginRight: px(36 * s),
            backgroundColor: strip,
            color: onStrip,
            padding: `${px(34 * s)} ${px(36 * s)}`,
            gap: px(12 * s),
          },
          [
            text(
              {
                fontFamily: ctx.fonts.body,
                fontWeight: 700,
                fontSize: px(20 * s),
                letterSpacing: '3px',
                textTransform: 'uppercase',
                opacity: 0.85,
              },
              slide.kind === 'point' ? pointNumber(ctx) : slide.kicker,
            ),
            text(
              { fontFamily: ctx.fonts.headings, fontWeight: 700, fontSize: px(titleSize), lineHeight: 1.08 },
              slide.title,
            ),
          ],
        ),
      ]),
      text(
        {
          fontFamily: ctx.fonts.body,
          fontSize: px(28 * s),
          lineHeight: 1.45,
          color: mix(readable(bg), bg, 0.25),
        },
        slide.body,
      ),
      box({ justifyContent: 'space-between', alignItems: 'center' }, [
        slide.kind === 'cta'
          ? text(
              { fontFamily: ctx.fonts.body, fontWeight: 700, fontSize: px(30 * s), color: strip },
              handleText(ctx),
            )
          : brandMark(ctx, 40 * s, readable(bg)),
        swipeHint(ctx, strip),
      ]),
    ])
  },
}

// Event Promo: naziv događaja, datum i mesto ------------------------------------------------------
const event: StyleDef = {
  id: 'event',
  group: 'photo',
  fonts: { headings: 'Oswald', body: 'brand' },
  photo: 'all',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 72 * s
    const chips = (slide.kicker ?? '')
      .split(/[·|•]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 3)
    const titleSize = fit(slide.title.toUpperCase(), {
      max: 120 * s,
      min: 52 * s,
      width: W(ctx, p),
      height: ctx.size.height * 0.3 * tall(ctx),
      lineHeight: 0.98,
      charWidth: 0.46,
    })
    return root(ctx, { padding: px(p), color: '#ffffff', justifyContent: 'space-between' }, [
      backdrop(ctx, `linear-gradient(160deg, ${mix(ctx.colors.primary, '#000000', 0.2)} 0%, #0d0d12 100%)`),
      shade(ctx, 0.2, 0.9),
      topBar(ctx, alpha('#ffffff', 0.85)),
      col({ gap: px(26 * s) }, [
        chips.length
          ? box(
              { gap: px(14 * s), flexWrap: 'wrap' },
              chips.map((c) =>
                text(
                  {
                    backgroundColor: ctx.colors.primary,
                    color: readable(ctx.colors.primary),
                    fontFamily: ctx.fonts.body,
                    fontWeight: 700,
                    fontSize: px(26 * s),
                    padding: `${px(10 * s)} ${px(22 * s)}`,
                    borderRadius: px(10 * s),
                  },
                  c,
                ),
              ),
            )
          : null,
        text(
          {
            fontFamily: ctx.fonts.headings,
            fontWeight: 700,
            fontSize: px(titleSize),
            lineHeight: 0.98,
            textTransform: 'uppercase',
            width: px(W(ctx, p)),
          },
          slide.title,
        ),
        text(
          {
            fontFamily: ctx.fonts.body,
            fontSize: px(30 * s),
            lineHeight: 1.4,
            color: alpha('#ffffff', 0.88),
          },
          slide.body,
        ),
        box({ justifyContent: 'space-between', alignItems: 'center' }, [
          text(
            {
              border: `${px(3 * s)} solid #ffffff`,
              fontFamily: ctx.fonts.body,
              fontWeight: 700,
              fontSize: px(26 * s),
              padding: `${px(12 * s)} ${px(26 * s)}`,
              borderRadius: px(40 * s),
            },
            handleText(ctx),
          ),
          swipeHint(ctx, '#ffffff'),
        ]),
      ]),
    ])
  },
}

// Social: objava u obliku kartice društvene mreže --------------------------------------------------
const social: StyleDef = {
  id: 'social',
  group: 'photo',
  fonts: { headings: 'brand', body: 'brand' },
  photo: 'optional',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 64 * s
    const bg = mix(ctx.colors.background, ctx.colors.primary, 0.1)
    const card = '#ffffff'
    const ink = '#14171a'
    const inner = W(ctx, p) - 96 * s
    const hasPhoto = Boolean(ctx.photo)
    const titleSize = fit(slide.title, {
      max: 58 * s,
      min: 34 * s,
      width: inner,
      height: ctx.size.height * (hasPhoto ? 0.16 : 0.3) * tall(ctx),
      lineHeight: 1.15,
    })
    const avatar = ctx.logo
      ? img(ctx.logo, {
          width: px(76 * s),
          height: px(76 * s),
          borderRadius: px(40 * s),
          objectFit: 'contain',
          backgroundColor: '#ffffff',
          border: `${px(2 * s)} solid ${alpha(ink, 0.08)}`,
        })
      : text(
          {
            width: px(76 * s),
            height: px(76 * s),
            borderRadius: px(40 * s),
            backgroundColor: ctx.colors.primary,
            color: readable(ctx.colors.primary),
            fontFamily: ctx.fonts.headings,
            fontWeight: 700,
            fontSize: px(36 * s),
            alignItems: 'center',
            justifyContent: 'center',
          },
          ctx.brandName.trim().charAt(0).toUpperCase(),
        )
    return root(ctx, { backgroundColor: bg, padding: px(p), justifyContent: 'center' }, [
      col(
        {
          backgroundColor: card,
          borderRadius: px(36 * s),
          padding: px(48 * s),
          gap: px(24 * s),
          color: ink,
          boxShadow: `0 ${px(20 * s)} ${px(60 * s)} ${alpha('#000000', 0.12)}`,
        },
        [
          box({ alignItems: 'center', gap: px(20 * s) }, [
            avatar,
            col({ gap: px(4 * s), flexGrow: 1 }, [
              text({ fontFamily: ctx.fonts.headings, fontWeight: 700, fontSize: px(30 * s) }, ctx.brandName),
              text(
                { fontFamily: ctx.fonts.body, fontSize: px(24 * s), color: alpha(ink, 0.55) },
                handleText(ctx),
              ),
            ]),
            text({ fontSize: px(36 * s), color: alpha(ink, 0.45) }, '···'),
          ]),
          text(
            {
              fontFamily: ctx.fonts.body,
              fontWeight: 700,
              fontSize: px(22 * s),
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: ctx.colors.primary,
            },
            slide.kind === 'point' ? pointNumber(ctx) : slide.kicker,
          ),
          text(
            { fontFamily: ctx.fonts.headings, fontWeight: 700, fontSize: px(titleSize), lineHeight: 1.15 },
            slide.title,
          ),
          text(
            { fontFamily: ctx.fonts.body, fontSize: px(27 * s), lineHeight: 1.45, color: alpha(ink, 0.72) },
            slide.body,
          ),
          hasPhoto
            ? img(ctx.photo!, {
                width: px(inner),
                height: px(ctx.size.height * 0.3),
                objectFit: 'cover',
                borderRadius: px(22 * s),
              })
            : null,
          box({ justifyContent: 'space-between', alignItems: 'center' }, [
            box({ gap: px(30 * s) }, [
              icon('heart', 40 * s, alpha(ink, 0.6)),
              icon('comment', 40 * s, alpha(ink, 0.6)),
              icon('send', 40 * s, alpha(ink, 0.6)),
            ]),
            text(
              { fontFamily: ctx.fonts.body, fontSize: px(22 * s), color: alpha(ink, 0.5) },
              counterText(ctx) ?? '',
            ),
          ]),
        ],
      ),
    ])
  },
}

// Snap: fotografija preko celog slajda, natpis kao nalepnica --------------------------------------
const snap: StyleDef = {
  id: 'snap',
  group: 'photo',
  fonts: { headings: 'brand', body: 'brand' },
  photo: 'all',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 64 * s
    const stickerW = W(ctx, p) * 0.86
    const titleSize = fit(slide.title, {
      max: 58 * s,
      min: 32 * s,
      width: stickerW - 70 * s,
      height: ctx.size.height * 0.18 * tall(ctx),
      lineHeight: 1.12,
    })
    return root(ctx, { padding: px(p), justifyContent: 'space-between' }, [
      backdrop(ctx),
      box({ justifyContent: 'flex-end' }, [
        text(
          {
            backgroundColor: alpha('#000000', 0.45),
            color: '#ffffff',
            fontFamily: ctx.fonts.body,
            fontWeight: 700,
            fontSize: px(24 * s),
            padding: `${px(8 * s)} ${px(18 * s)}`,
            borderRadius: px(20 * s),
          },
          counterText(ctx) ?? handleText(ctx),
        ),
      ]),
      col({ gap: px(14 * s), alignItems: 'flex-start' }, [
        text(
          {
            backgroundColor: ctx.colors.primary,
            color: readable(ctx.colors.primary),
            fontFamily: ctx.fonts.body,
            fontWeight: 700,
            fontSize: px(22 * s),
            padding: `${px(8 * s)} ${px(18 * s)}`,
            transform: 'rotate(-2deg)',
            letterSpacing: '1px',
            textTransform: 'uppercase',
          },
          slide.kind === 'point' ? pointNumber(ctx) : (slide.kicker ?? handleText(ctx)),
        ),
        col(
          {
            backgroundColor: '#ffffff',
            color: '#111111',
            padding: `${px(28 * s)} ${px(34 * s)}`,
            width: px(stickerW),
            gap: px(10 * s),
            transform: 'rotate(-1deg)',
            boxShadow: `0 ${px(10 * s)} ${px(30 * s)} ${alpha('#000000', 0.3)}`,
          },
          [
            text(
              { fontFamily: ctx.fonts.headings, fontWeight: 700, fontSize: px(titleSize), lineHeight: 1.12 },
              slide.title,
            ),
            text(
              { fontFamily: ctx.fonts.body, fontSize: px(24 * s), lineHeight: 1.4, color: '#444444' },
              slide.body,
            ),
          ],
        ),
        slide.kind === 'cta'
          ? text(
              { fontFamily: ctx.fonts.body, fontWeight: 700, fontSize: px(26 * s), color: '#ffffff' },
              handleText(ctx),
            )
          : null,
      ]),
    ])
  },
}

// Meme: fotografija i krupan beli natpis sa crnom ivicom ------------------------------------------
const meme: StyleDef = {
  id: 'meme',
  group: 'photo',
  fonts: { headings: 'Oswald', body: 'Oswald' },
  photo: 'all',
  render(slide, ctx) {
    const s = sc(ctx)
    const p = 48 * s
    const outline = `${px(3 * s)} ${px(3 * s)} 0 #000, ${px(-3 * s)} ${px(-3 * s)} 0 #000, ${px(3 * s)} ${px(-3 * s)} 0 #000, ${px(-3 * s)} ${px(3 * s)} 0 #000, 0 ${px(4 * s)} ${px(8 * s)} rgba(0,0,0,0.5)`
    const caption = (value: string | null | undefined, max: number, share: number) =>
      value
        ? text(
            {
              fontFamily: ctx.fonts.headings,
              fontWeight: 700,
              fontSize: px(
                fit(value.toUpperCase(), {
                  max: max * s,
                  min: 40 * s,
                  width: W(ctx, p),
                  height: ctx.size.height * share,
                  lineHeight: 1.02,
                  charWidth: 0.5,
                }),
              ),
              lineHeight: 1.02,
              textTransform: 'uppercase',
              color: '#ffffff',
              textAlign: 'center',
              justifyContent: 'center',
              width: px(W(ctx, p)),
              textShadow: outline,
            },
            value,
          )
        : null
    return root(
      ctx,
      { padding: px(p), justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111111' },
      [
        backdrop(ctx, `linear-gradient(180deg, #2a2a2a, #0b0b0b)`),
        caption(slide.title, 110, 0.3 * tall(ctx)),
        col({ alignItems: 'center', gap: px(12 * s) }, [
          caption(slide.body, 64, 0.2 * tall(ctx)),
          text(
            {
              fontFamily: ctx.fonts.body,
              fontSize: px(24 * s),
              color: '#ffffff',
              textShadow: outline,
              letterSpacing: '1px',
            },
            handleText(ctx),
          ),
        ]),
      ],
    )
  },
}

// Film: kadar 35 mm filma, perforacija, fotografija u kadru i mono oznake -------------------------
const film: StyleDef = {
  id: 'film',
  group: 'photo',
  fonts: { headings: 'JetBrains Mono', body: 'JetBrains Mono' },
  photo: 'all',
  render(slide, ctx) {
    const s = sc(ctx)
    const bg = '#121110'
    const amber = '#f2b84b'
    const holes = (top: boolean) =>
      box(
        {
          position: 'absolute',
          left: px(24 * s),
          right: px(24 * s),
          [top ? 'top' : 'bottom']: px(22 * s),
          justifyContent: 'space-between',
        },
        Array.from({ length: 14 }, () =>
          el('div', {
            width: px(38 * s),
            height: px(26 * s),
            borderRadius: px(6 * s),
            backgroundColor: '#e9e4d8',
          }),
        ),
      )
    const frameW = ctx.size.width - 120 * s
    const frameH = ctx.size.height * (ctx.format === 'square' ? 0.5 : 0.52)
    const titleSize = fit(slide.title.toUpperCase(), {
      max: 54 * s,
      min: 30 * s,
      width: frameW,
      height: ctx.size.height * 0.16 * tall(ctx),
      lineHeight: 1.15,
      charWidth: 0.62,
    })
    const label = { fontFamily: ctx.fonts.body, fontSize: px(22 * s), color: amber, letterSpacing: '2px' }
    return root(
      ctx,
      {
        backgroundColor: bg,
        padding: `${px(96 * s)} ${px(60 * s)}`,
        color: '#f5f1e8',
        justifyContent: 'space-between',
      },
      [
        holes(true),
        holes(false),
        box({ justifyContent: 'space-between' }, [
          text(label, `ISO 400 · ${counterText(ctx) ?? '01 / 01'}`),
          text(label, `${String(ctx.index + 1).padStart(2, '0')}A`),
        ]),
        ctx.photo
          ? img(ctx.photo, {
              width: px(frameW),
              height: px(frameH),
              objectFit: 'cover',
              borderRadius: px(6 * s),
            })
          : el('div', {
              width: px(frameW),
              height: px(frameH),
              borderRadius: px(6 * s),
              backgroundImage: `linear-gradient(135deg, ${mix(ctx.colors.primary, bg, 0.3)}, ${mix(ctx.colors.secondary, bg, 0.5)})`,
            }),
        col({ gap: px(14 * s) }, [
          text(label, slide.kind === 'point' ? `#${pointNumber(ctx)}` : slide.kicker),
          text(
            {
              fontFamily: ctx.fonts.headings,
              fontWeight: 700,
              fontSize: px(titleSize),
              lineHeight: 1.15,
              textTransform: 'uppercase',
            },
            slide.title,
          ),
          text(
            {
              fontFamily: ctx.fonts.body,
              fontSize: px(24 * s),
              lineHeight: 1.5,
              color: alpha('#f5f1e8', 0.75),
            },
            slide.body,
          ),
        ]),
        box({ justifyContent: 'space-between' }, [
          text(label, handleText(ctx)),
          text(label, ctx.total > 1 && ctx.index === 0 ? '→' : 'EXP'),
        ]),
      ],
    )
  },
}

export const PHOTO_STYLES: StyleDef[] = [
  poster,
  editorial,
  cover,
  duotone,
  framed,
  event,
  social,
  snap,
  meme,
  film,
]
