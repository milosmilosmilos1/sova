import { fileTypeFromBuffer } from 'file-type'
import { describe, expect, it } from 'vitest'

import { buildMp4 } from '../../../tests/fixtures/mp4'

import { parseMp4, stripVideoMetadata } from './mp4'

describe('parseMp4', () => {
  it('vertikalan video: trajanje, dimenzije i kodeci', () => {
    expect(parseMp4(buildMp4({ durationMs: 15_000, width: 1080, height: 1920 }))).toEqual({
      durationMs: 15_000,
      width: 1080,
      height: 1920,
      rotation: 0,
      videoCodec: 'avc1',
      audioCodec: 'mp4a',
    })
  })

  it('telefon: položen zapis sa rotacijom 90° prikazuje se vertikalno', () => {
    const info = parseMp4(buildMp4({ width: 1920, height: 1080, rotation: 90, videoCodec: 'hvc1' }))
    expect(info).toMatchObject({ width: 1080, height: 1920, rotation: 90, videoCodec: 'hvc1' })
    expect(parseMp4(buildMp4({ width: 1920, height: 1080, rotation: 180 }))).toMatchObject({
      width: 1920,
      height: 1080,
      rotation: 180,
    })
  })

  it('moov na kraju, 64-bitna mdat kutija i verzija 1 zaglavlja', () => {
    const info = parseMp4(buildMp4({ moovAtEnd: true, largeMdat: true, version1: true, durationMs: 61_500 }))
    expect(info.durationMs).toBe(61_500)
    expect(info.height).toBe(1920)
  })

  it('MOV (QuickTime) ima istu strukturu; video bez zvuka', () => {
    const info = parseMp4(buildMp4({ brand: 'qt  ', audioCodec: null }))
    expect(info.audioCodec).toBeNull()
    expect(info.videoCodec).toBe('avc1')
  })

  it('samo zvuk, nepotpun fajl i nasumični bajtovi daju grešku', () => {
    expect(() => parseMp4(buildMp4({ noVideo: true }))).toThrow('video traku')
    const full = buildMp4({ moovAtEnd: true })
    expect(() => parseMp4(full.subarray(0, full.length - 200))).toThrow('moov')
    expect(() => parseMp4(Buffer.from('ovo nije video, samo tekst koji liči na bajtove'))).toThrow()
  })

  it('file-type prepoznaje sintetički fajl kao MP4 odnosno MOV', async () => {
    expect((await fileTypeFromBuffer(buildMp4()))?.mime).toBe('video/mp4')
    expect((await fileTypeFromBuffer(buildMp4({ brand: 'qt  ' })))?.mime).toBe('video/quicktime')
  })

  it('uklanja lokaciju snimka (udta/©xyz i QuickTime meta), a video ostaje čitljiv', () => {
    const where = '+44.8125+020.4612/'
    const original = buildMp4({ location: where, moovAtEnd: true })
    expect(original.includes(where)).toBe(true)
    const { data, stripped } = stripVideoMetadata(original)
    expect(stripped).toBe(2)
    expect(data.includes(where)).toBe(false)
    expect(data.includes('ISO6709')).toBe(false)
    expect(data.length).toBe(original.length)
    expect(parseMp4(data)).toEqual(parseMp4(original))
    // original se ne menja; video bez metapodataka prolazi bez izmena
    expect(original.includes(where)).toBe(true)
    expect(stripVideoMetadata(buildMp4()).stripped).toBe(0)
  })
})
