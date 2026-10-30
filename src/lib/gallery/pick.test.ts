import { describe, expect, it } from 'vitest'

import { normalizePhotoDescription } from '@/lib/ai/prompts/photo-describe'

import { galleryScore, galleryWords, rankGalleryPhotos, type GalleryCandidate } from './pick'

/** Izbor fotografije iz galerije (D-114). */
const photo = (over: Partial<GalleryCandidate>): GalleryCandidate => ({
  id: 'x',
  description: null,
  altText: null,
  tags: [],
  categoryName: null,
  lastUsedAt: null,
  createdAt: '2026-10-01T10:00:00Z',
  ...over,
})

describe('galerija: izbor fotografije', () => {
  it('reči su mala slova, bez kratkih i čestih', () => {
    expect(galleryWords('Kako da ODRŽAVATE klimu pre leta?', 'the air conditioner')).toEqual([
      'održavate',
      'klimu',
      'leta',
      'air',
      'conditioner',
    ])
  })

  it('tačna reč vredi više od istog korena, a kategorija i tagovi se računaju', () => {
    const p = photo({
      description: 'Majstor servisira klima uređaj',
      categoryName: 'Servis',
      tags: ['air conditioner'],
    })
    expect(galleryScore(p, ['servis'])).toBe(2)
    expect(galleryScore(p, ['servisiranje'])).toBe(1)
    expect(galleryScore(p, ['conditioner'])).toBe(2)
    expect(galleryScore(p, ['plaža'])).toBe(0)
    expect(galleryScore(photo({ description: 'Majstor montira klimu' }), ['klima'])).toBe(1)
    expect(galleryScore(p, [])).toBe(0)
  })

  it('redosled: poklapanje, pa najduže nekorišćena, pa najnovija', () => {
    const a = photo({ id: 'a', description: 'tim na terenu', lastUsedAt: '2026-10-20T10:00:00Z' })
    const b = photo({ id: 'b', description: 'tim na terenu', lastUsedAt: null })
    const c = photo({ id: 'c', description: 'klima u dnevnoj sobi' })
    const d = photo({ id: 'd', description: 'klima u dnevnoj sobi', createdAt: '2026-10-25T10:00:00Z' })
    expect(rankGalleryPhotos([a, b, c, d], galleryWords('tim terenu')).map((p) => p.id)).toEqual([
      'b',
      'a',
      'd',
      'c',
    ])
  })

  it('opis iz modela: skraćen, a tagovi na oba jezika bez duplikata i heštega', () => {
    const out = normalizePhotoDescription({
      description: '  Majstor   montira klimu  ',
      tags: ['#Klima', 'majstor', 'klima'],
      tags_en: ['air conditioner', 'Klima', ...Array.from({ length: 12 }, (_, i) => `tag ${i}`)],
    })
    expect(out.description).toBe('Majstor montira klimu')
    expect(out.tags.slice(0, 3)).toEqual(['klima', 'majstor', 'air conditioner'])
    expect(out.tags).toHaveLength(12)
  })
})
