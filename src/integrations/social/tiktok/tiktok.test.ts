import { describe, expect, it } from 'vitest'

import { readTikTokOptions, tiktokOptionProblems } from '@/config/tiktok'

import { mapTikTokError, planChunks, quoteBigInts } from './client'
import { cutUtf16, tiktokPermalink } from './provider'

const MB = 1024 * 1024

describe('TikTok FILE_UPLOAD podela', () => {
  it('do 64 MB jedan deo cele veličine', () => {
    expect(planChunks(1 * MB)).toEqual({ chunkSize: MB, totalChunks: 1, ranges: [{ start: 0, end: MB - 1 }] })
    expect(planChunks(64 * MB).totalChunks).toBe(1)
  })

  it('veće u delovima od 32 MB; poslednji upija ostatak i ostaje ispod 128 MB', () => {
    const size = 100 * MB + 123
    const plan = planChunks(size)
    expect(plan.chunkSize).toBe(32 * MB)
    expect(plan.totalChunks).toBe(Math.floor(size / (32 * MB)))
    expect(plan.ranges[0]).toEqual({ start: 0, end: 32 * MB - 1 })
    const last = plan.ranges.at(-1)!
    expect(last.end).toBe(size - 1)
    expect(last.end - last.start + 1).toBeLessThanOrEqual(128 * MB)
    for (let i = 1; i < plan.ranges.length; i++)
      expect(plan.ranges[i]!.start).toBe(plan.ranges[i - 1]!.end + 1)
  })
})

describe('TikTok pomoćne funkcije', () => {
  it('skraćivanje po UTF-16 ne cepa emoji', () => {
    expect(cutUtf16('abc', 90)).toBe('abc')
    expect(cutUtf16('ab😀', 3)).toBe('ab')
    expect(cutUtf16('ab😀c', 4)).toBe('ab😀')
  })

  it('link objave traži korisničko ime', () => {
    expect(tiktokPermalink('klima', '1', 'photo')).toBe('https://www.tiktok.com/@klima/photo/1')
    expect(tiktokPermalink(null, '1', 'video')).toBeNull()
  })

  it('greške: limit objava je kvota sa porukom na srpskom, 401 token, 5xx privremeno', () => {
    const quota = mapTikTokError(403, { code: 'spam_risk_too_many_posts', message: 'too many' })
    expect(quota.code).toBe('QUOTA_EXCEEDED')
    expect(quota.userMessage).toContain('ograničio broj objava')
    expect(mapTikTokError(401, { code: 'access_token_invalid' }).code).toBe('TOKEN_INVALID')
    const down = mapTikTokError(503, null)
    expect(down.code).toBe('PROVIDER_DOWN')
    expect(down.retryable).toBe(true)
    expect(
      mapTikTokError(403, { code: 'unaudited_client_can_only_post_to_private_accounts' }).userMessage,
    ).toContain('privatne')
  })
})

describe('TikTok podešavanja objave', () => {
  it('bez izbora: privatnost i saglasnost fale; nepoznate vrednosti se ne pretpostavljaju', () => {
    const empty = readTikTokOptions({ privacyLevel: 'EVERYONE', consent: 'da' })
    expect(empty.privacyLevel).toBeNull()
    expect(empty.consent).toBe(false)
    const problems = tiktokOptionProblems(empty)
    expect(problems).toHaveLength(2)
  })

  it('komercijalni sadržaj traži vrstu; brendirani ne može biti „Samo ja”', () => {
    const base = { privacyLevel: 'SELF_ONLY', consent: true, commercial: true }
    expect(tiktokOptionProblems(readTikTokOptions(base)).join(' ')).toContain('Vaš brend')
    expect(tiktokOptionProblems(readTikTokOptions({ ...base, brandedContent: true })).join(' ')).toContain(
      'samo vama',
    )
    expect(
      tiktokOptionProblems(
        readTikTokOptions({ ...base, privacyLevel: 'PUBLIC_TO_EVERYONE', brandOrganic: true }),
      ),
    ).toEqual([])
  })

  it('oznake brenda važe samo uz uključen komercijalni sadržaj', () => {
    const o = readTikTokOptions({ privacyLevel: 'PUBLIC_TO_EVERYONE', consent: true, brandedContent: true })
    expect(o.brandedContent).toBe(false)
  })
})

describe('TikTok int64 ID-jevi', () => {
  it('broj od 19 cifara ostaje tačan; stringovi, mali brojevi i vremena se ne diraju', () => {
    const raw =
      '{"data":{"title":"Kod 7311000000000000001, [7311000000000000001]","ids":[7311000000000000001,7311000000000000002],"n":42,"t":1761100000000,"f":-1.5e3}}'
    const parsed = JSON.parse(quoteBigInts(raw)) as {
      data: { title: string; ids: string[]; n: number; t: number; f: number }
    }
    expect(parsed.data.ids).toEqual(['7311000000000000001', '7311000000000000002'])
    expect(parsed.data.title).toBe('Kod 7311000000000000001, [7311000000000000001]')
    expect(parsed.data.n).toBe(42)
    expect(parsed.data.t).toBe(1761100000000)
    expect(parsed.data.f).toBe(-1500)
  })

  it('escape-ovan navodnik u stringu ne zbuni parser', () => {
    const bs = String.fromCharCode(92)
    const raw = `{"a":"x${bs}"y 1234567890123456789","b":1234567890123456789}`
    const parsed = JSON.parse(quoteBigInts(raw)) as { a: string; b: string }
    expect(parsed.a).toBe('x"y 1234567890123456789')
    expect(parsed.b).toBe('1234567890123456789')
  })
})
