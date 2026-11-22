import { execFileSync } from 'node:child_process'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { localePath, splitLocalePath } from '@/i18n/paths'
import { routeLocale, type LocaleRequest } from '@/i18n/routing'

import { faqFrom, parseBlocks, parseDoc, parseInline, slugify, wordCount } from './markdown'
import { getPost, listPosts, postBlocks, relatedPosts } from './posts'

describe('markdown bloga (D-186)', () => {
  it('front matter, naslovi sa sidrima, okvir, slika, tabela i liste', () => {
    const doc = parseDoc(
      [
        '---',
        'slug: probni',
        'naslov: Probni: tekst',
        '---',
        'Prvi pasus sa **boldom** i [linkom](@drugi).',
        'Isti pasus.',
        '',
        ':::ukratko',
        '- jedna',
        '- **dve**',
        ':::',
        '',
        '## Šta je ovo?',
        '!slika:probni-1',
        '| A | B |',
        '|---|---|',
        '| 1 | [x](/register) |',
        '',
        '1. prvi',
        '2. drugi',
        '',
        '## Šta je ovo?',
      ].join('\n'),
    )
    expect(doc.meta).toEqual({ slug: 'probni', naslov: 'Probni: tekst' })
    expect(doc.blocks.map((b) => b.type)).toEqual(['p', 'summary', 'h2', 'image', 'table', 'ol', 'h2'])
    const [p, , h2, , table, , h2b] = doc.blocks
    expect(p).toMatchObject({ type: 'p' })
    expect(h2).toMatchObject({ id: 'sta-je-ovo', text: 'Šta je ovo?' })
    // isti naslov dvaput dobija drugo sidro
    expect(h2b).toMatchObject({ id: 'sta-je-ovo-2' })
    expect(table).toMatchObject({ type: 'table', rows: [[expect.anything(), expect.anything()]] })
  })

  it('red: podebljano, link sa podebljanim tekstom i običan tekst', () => {
    expect(parseInline('a **b** [**c**](@d) e')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'strong', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'link', href: '@d', children: [{ type: 'strong', children: [{ type: 'text', text: 'c' }] }] },
      { type: 'text', text: ' e' },
    ])
  })

  it('sidra bez kvačica i pitanja i odgovori iz odeljka', () => {
    expect(slugify('Koliko košta đak u Čačku?')).toBe('koliko-kosta-djak-u-cacku')
    const blocks = parseBlocks(
      '## Česta pitanja\n\n### Pitanje?\n\nOdgovor jedan.\n\nOdgovor dva.\n\n### Bez odgovora?\n',
    )
    expect(faqFrom(blocks, 'Česta pitanja')).toEqual([{ q: 'Pitanje?', a: 'Odgovor jedan. Odgovor dva.' }])
    expect(wordCount(blocks)).toBe(9)
  })
})

describe('članci bloga (D-186)', () => {
  const sr = listPosts('sr-Latn')
  const en = listPosts('en')

  it('svaki srpski članak ima engleski prevod sa svojim slugom', () => {
    expect(sr.length).toBeGreaterThanOrEqual(20)
    expect(en.map((p) => p.id).sort()).toEqual(sr.map((p) => p.id).sort())
    for (const post of en) expect(post.slug).not.toBe(post.id)
  })

  it('engleska adresa ima engleski slug, a interna putanja je srpski slug', () => {
    const post = en[0]!
    expect(localePath('en', `/blog/${post.id}`)).toBe(`/en/blog/${post.slug}`)
    expect(localePath('sr-Latn', `/blog/${post.id}`)).toBe(`/blog/${post.id}`)
    expect(splitLocalePath(`/en/blog/${post.slug}`)).toEqual({ locale: 'en', path: `/blog/${post.id}` })
    expect(localePath('en', '/blog')).toBe('/en/blog')
  })

  it('srpski slug pod /en trajno vodi na engleski slug', () => {
    const post = en[0]!
    const req: LocaleRequest = {
      pathname: `/en/blog/${post.id}`,
      search: '',
      cookie: 'en',
      method: 'GET',
      accept: 'text/html',
      rsc: false,
    }
    expect(routeLocale(req)).toEqual({
      kind: 'redirect',
      location: `/en/blog/${post.slug}`,
      cookie: null,
      permanent: true,
    })
    expect(routeLocale({ ...req, pathname: `/en/blog/${post.slug}` })).toMatchObject({
      kind: 'rewrite',
      path: `/blog/${post.id}`,
    })
  })

  it('tekst se čita, ima pitanja i srodne članke', () => {
    const post = getPost('sr-Latn', sr[0]!.id)!
    expect(postBlocks(post).some((b) => b.type === 'h2')).toBe(true)
    expect(faqFrom(postBlocks(post), 'Česta pitanja').length).toBeGreaterThanOrEqual(3)
    expect(relatedPosts(post)).toHaveLength(3)
    expect(relatedPosts(post).every((p) => p.id !== post.id && p.locale === 'sr-Latn')).toBe(true)
  })

  it('podaci su ažurni sa markdown fajlovima (scripts/blog-build.mjs --check)', () => {
    const root = path.resolve(__dirname, '../../..')
    const out = execFileSync(
      process.execPath,
      ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/blog-build.mjs', '--check'],
      { cwd: root, encoding: 'utf8' },
    )
    expect(out).toContain('podaci ažurni')
  })
})
