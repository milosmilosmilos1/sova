import { describe, expect, it } from 'vitest'

import { publicMediaUrl, signMediaToken, verifyMediaToken } from './public-url'

const ASSET = '0b5c6a8e-1111-4222-8333-944455556666'

describe('javni URL medija', () => {
  it('potpisan token se proverava i nosi varijantu; ekstenzija se ignoriše', () => {
    const token = signMediaToken(ASSET, 'tiktok')
    expect(verifyMediaToken(token)).toEqual({ assetId: ASSET, variant: 'tiktok' })
    expect(verifyMediaToken(`${token}.jpg`)).toEqual({ assetId: ASSET, variant: 'tiktok' })
  })

  it('izmenjen potpis, druga varijanta ili istekao token ne prolaze', () => {
    const token = signMediaToken(ASSET, 'orig')
    const [id, , exp, sig] = token.split('.')
    expect(verifyMediaToken(`${id}.tiktok.${exp}.${sig}`)).toBeNull()
    expect(verifyMediaToken(`${id}.orig.${Number(exp) + 1}.${sig}`)).toBeNull()
    expect(verifyMediaToken(token, Date.now() + 3 * 3600_000)).toBeNull()
    expect(verifyMediaToken('nije-token')).toBeNull()
  })

  it('URL je na adresi aplikacije (u testu nema PUBLIC_MEDIA_BASE_URL); TikTok varijanta ima .jpg', () => {
    const url = publicMediaUrl(ASSET, 'tiktok')
    expect(url.startsWith('http://localhost:3001/api/media/public/')).toBe(true)
    expect(url.endsWith('.jpg')).toBe(true)
    expect(publicMediaUrl(ASSET, 'orig').endsWith('.jpg')).toBe(false)
  })
})
