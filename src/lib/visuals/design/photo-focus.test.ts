import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'

import type { Focus } from '../focus'
import { configureFontLoader, loadFonts } from '../fonts'
import { toDataUri } from '../render'
import { box, el, img } from './kit'
import { focusPhotoNodes, preparePhoto, renderSlide } from './render'
import { getStyle } from './index'

/**
 * Fotografija u okviru stila ide ka glavnom predmetu (D-167): `objectPosition` po fokusu na svakom
 * `img` sa fotografijom koji stil seče, i Satori ga zaista poštuje.
 */
const colors = {
  primary: '#F26B1D',
  secondary: '#2B59C3',
  background: '#FFFFFF',
  text: '#101116',
  muted: '#5C5C68',
}

/** Kvadrat: leva polovina crvena, desna plava. */
async function halves(size: number): Promise<Buffer> {
  const half = await sharp({
    create: { width: size / 2, height: size, channels: 3, background: { r: 230, g: 20, b: 20 } },
  })
    .png()
    .toBuffer()
  return sharp({ create: { width: size, height: size, channels: 3, background: { r: 20, g: 20, b: 230 } } })
    .composite([{ input: half, left: 0, top: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer()
}

/** Prosečna boja trake po sredini slike (x od 45% do 55%, cela visina). */
async function middle(png: Buffer): Promise<{ r: number; b: number }> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  let r = 0
  let b = 0
  let n = 0
  for (let y = 0; y < info.height; y += 4)
    for (let x = Math.floor(info.width * 0.45); x < info.width * 0.55; x += 2) {
      const i = (y * info.width + x) * info.channels
      r += data[i]!
      b += data[i + 2]!
      n++
    }
  return { r: r / n, b: b / n }
}

let photo: string
beforeAll(async () => {
  configureFontLoader({ remote: false })
  photo = toDataUri(await halves(800), 'image/jpeg')
})

describe('fotografija ka glavnom predmetu (D-167)', () => {
  it('objectPosition dobija samo fotografija koju stil seče, i samo kad stil nije zadao svoj', () => {
    const tree = box({ width: 100 }, [
      img(photo, { width: 100, height: 50, objectFit: 'cover' }),
      img(photo, { width: 100, height: 50, objectFit: 'contain' }),
      img('data:image/png;base64,logo', { width: 10, height: 10, objectFit: 'cover' }),
      img(photo, { width: 100, height: 50, objectFit: 'cover', objectPosition: '10% 10%' }),
      el('div', {}, [img(photo, { width: 20, height: 40, objectFit: 'cover' })]),
    ])
    focusPhotoNodes(tree, photo, { x: 0.2, y: 0.75 })
    const styles = (
      tree.props.children as Array<{ props: { style: Record<string, unknown>; children?: unknown } }>
    ).map((c) => c.props.style.objectPosition)
    expect(styles).toEqual(['20% 75%', undefined, undefined, '10% 10%', undefined])
    const nested = tree.props.children as Array<{
      props: { children: Array<{ props: { style: Record<string, unknown> } }> }
    }>
    expect(nested[4]!.props.children[0]!.props.style.objectPosition).toBe('20% 75%')
  })

  it('sa odnosom stranica fotografije predmet se centrira u okviru u pikselima (D-169)', () => {
    const tree = box({ width: 1080 }, [
      img(photo, { width: '936px', height: '405px', objectFit: 'cover' }),
      img(photo, { width: '100%', height: '100%', objectFit: 'cover' }),
    ])
    focusPhotoNodes(tree, photo, { x: 0.5, y: 0.6 }, 1.5)
    const positions = (tree.props.children as Array<{ props: { style: Record<string, unknown> } }>).map(
      (c) => c.props.style.objectPosition,
    )
    // traka 2,31 iz vodoravne 1,5: predmet na 60% visine u sredini trake; okvir bez piksela po tački
    expect(positions).toEqual(['50% 78.5%', '50% 60%'])
  })

  it('Satori seče fotografiju oko zadate tačke', async () => {
    const loaded = await loadFonts(['Inter'])
    const draw = async (focus: Focus) => {
      // uzan okvir: od kvadratne fotografije se vidi samo traka, levo ili desno
      const tree = box({ width: 40, height: 100 }, [
        img(photo, { width: 40, height: 100, objectFit: 'cover' }),
      ])
      focusPhotoNodes(tree, photo, focus)
      const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
        width: 40,
        height: 100,
        fonts: loaded.fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
      })
      return Buffer.from(new Resvg(svg).render().asPng())
    }
    const left = await middle(await draw({ x: 0, y: 0.5 }))
    const right = await middle(await draw({ x: 1, y: 0.5 }))
    expect(left.r).toBeGreaterThan(left.b + 100)
    expect(right.b).toBeGreaterThan(right.r + 100)
  })

  it('ceo slajd: predmet levo daje levu polovinu fotografije, desno desnu', async () => {
    const prepared = await preparePhoto(await halves(800), getStyle('poster'), colors)
    const render = (focus: Focus | null) =>
      renderSlide({
        styleId: 'poster',
        slide: { kind: 'cover', title: 'Naslov', body: null },
        format: 'story',
        colors,
        brandFonts: { headings: 'Inter', body: 'Inter' },
        brandName: 'Brend',
        handle: null,
        logo: null,
        photo: prepared,
        photoFocus: focus,
        index: 0,
        total: 1,
        outputWidth: 216,
        format_out: 'png',
      })
    const left = await middle((await render({ x: 0, y: 0.5 })).bytes)
    const right = await middle((await render({ x: 1, y: 0.5 })).bytes)
    expect(left.r).toBeGreaterThan(left.b)
    expect(right.b).toBeGreaterThan(right.r)
  })
})
