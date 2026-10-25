import { afterEach, describe, expect, it, vi } from 'vitest'

import robots from '@/app/robots'
import sitemap from '@/app/sitemap'

import { isIndexableHost, siteUrl } from './seo'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('indeksiranje samo na pravom domenu (D-095)', () => {
  it('pravi domen i www da, pregledi, staging i localhost ne', () => {
    expect(isIndexableHost('https://sovaai.rs')).toBe(true)
    expect(isIndexableHost('https://www.sovaai.rs/')).toBe(true)
    expect(isIndexableHost('https://sova-git-main.vercel.app')).toBe(false)
    expect(isIndexableHost('https://staging.sovaai.rs')).toBe(false)
    expect(isIndexableHost('http://localhost:3001')).toBe(false)
    expect(isIndexableHost('nije adresa')).toBe(false)
  })

  it('robots i sitemap na produkciji', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://sovaai.rs/')
    expect(siteUrl()).toBe('https://sovaai.rs')
    const r = robots()
    expect(r.sitemap).toBe('https://sovaai.rs/sitemap.xml')
    const rule = Array.isArray(r.rules) ? r.rules[0]! : r.rules
    expect(rule.disallow).toEqual(expect.arrayContaining(['/app', '/admin', '/api/', '/approve/']))
    expect(rule.allow).toEqual(expect.arrayContaining(['/api/media/public/']))
    const urls = sitemap().map((e) => e.url)
    expect(urls).toContain('https://sovaai.rs/')
    expect(urls).toContain('https://sovaai.rs/privacy')
    expect(urls.some((u) => u.includes('/app') || u.includes('/login'))).toBe(false)
  })

  it('pregled na Vercel-u zabranjuje sve i nema mapu', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://sova-git-main.vercel.app')
    expect(robots().rules).toEqual([{ userAgent: '*', disallow: '/' }])
    expect(robots().sitemap).toBeUndefined()
    expect(sitemap()).toEqual([])
  })
})
