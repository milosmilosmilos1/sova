import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { BANNER_KINDS, PROFILE_BANNERS } from '@/config/profile-banners'

import { bannerTree, renderProfileBanner, type BannerInput } from './profile-banners'

const colors = {
  primary: '#0F766E',
  secondary: '#F59E0B',
  background: '#FFFFFF',
  text: '#111827',
  muted: '#6B7280',
}
const input = (kind: BannerInput['kind'], extra: Partial<BannerInput> = {}): BannerInput => ({
  kind,
  colors,
  fonts: { headings: 'Inter', body: 'Inter' },
  title: 'Adaptiko',
  subtitle: 'Adaptacija stanova od projekta do ključa',
  footer: 'adaptiko.rs',
  logo: null,
  ...extra,
})

type Node = { type: string; props: { style?: Record<string, string | number>; children?: unknown } }
const kids = (n: Node): Node[] => {
  const c = n.props.children
  return (Array.isArray(c) ? c : c ? [c] : []).filter((x): x is Node => typeof x === 'object')
}
const num = (v: string | number | undefined) => Number(String(v).replace('px', ''))

describe('naslovne slike profila (D-145)', () => {
  it('tekst je u delu koji se vidi: u sredini za Facebook i YouTube, desno od slike profila na X-u', () => {
    for (const kind of BANNER_KINDS) {
      const { width, height, safe, align } = PROFILE_BANNERS[kind]
      // deo koji se vidi je unutar slike
      expect(safe.x + safe.width, kind).toBeLessThanOrEqual(width)
      expect(safe.y + safe.height, kind).toBeLessThanOrEqual(height)
      const content = kids(bannerTree(input(kind), { headings: 'Inter', body: 'Inter' })).at(-1)!
      const s = content.props.style!
      expect(num(s.left), kind).toBeGreaterThanOrEqual(safe.x)
      expect(num(s.left) + num(s.width), kind).toBeLessThanOrEqual(safe.x + safe.width)
      expect(num(s.top) + num(s.height), kind).toBeLessThanOrEqual(safe.y + safe.height)
      expect(s.alignItems, kind).toBe(align === 'end' ? 'flex-end' : 'center')
    }
    expect(PROFILE_BANNERS.x.align).toBe('end')
    expect(PROFILE_BANNERS.youtube.safe).toMatchObject({ width: 1546, height: 423 })
  })

  it('prazno polje se ne crta, a tamna boja brenda dobija beli tekst', () => {
    const tree = bannerTree(input('facebook', { title: '  ', footer: '' }), {
      headings: 'Inter',
      body: 'Inter',
    })
    const content = kids(tree).at(-1)!
    expect(kids(content)).toHaveLength(1)
    expect(kids(content)[0]!.props.style!.color).toBe('rgba(255, 255, 255, 0.9)')
    const light = bannerTree(input('x', { colors: { ...colors, primary: '#FFD43B' } }), {
      headings: 'Inter',
      body: 'Inter',
    })
    expect(kids(kids(light).at(-1)!)[0]!.props.style!.color).toBe('#111111')
  })

  it('PNG je u veličini mreže, a pregled je uži', async () => {
    for (const kind of ['linkedin_page', 'youtube'] as const) {
      const meta = await sharp(await renderProfileBanner(input(kind))).metadata()
      expect(meta, kind).toMatchObject({
        width: PROFILE_BANNERS[kind].width,
        height: PROFILE_BANNERS[kind].height,
      })
    }
    const preview = await sharp(await renderProfileBanner(input('youtube'), 960)).metadata()
    expect(preview).toMatchObject({ width: 960, height: 540 })
  })
})
