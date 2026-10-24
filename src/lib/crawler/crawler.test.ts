import { describe, expect, it } from 'vitest'

import { chunkText } from './chunk'
import { canonicalPageKey, classifyPath, sameSite, shouldSkipUrl } from './classify'
import {
  buildPalette,
  contrastRatio,
  isNeutral,
  mergeSimilar,
  parseColorToken,
  parseCssColors,
} from './colors'
import { discoverUrls, hashList, parseFeed, readSitemap } from './discover'
import { decodeHtml, extractPage } from './extract'
import { extractFonts, googleFontsFromUrls, mapToGoogleFont } from './fonts'
import { sanitizeSvg } from './logo'
import type { CrawlDeps } from './types'

function deps(routes: Record<string, { body: string; type?: string; status?: number }>): CrawlDeps {
  return {
    fetch: async (input) => {
      const url = input.toString()
      const r = routes[url]
      if (!r)
        return {
          url,
          status: 404,
          ok: false,
          headers: new Headers(),
          body: Buffer.from(''),
          contentType: 'text/plain',
          redirected: false,
          elapsedMs: 1,
        }
      return {
        url,
        status: r.status ?? 200,
        ok: (r.status ?? 200) < 400,
        headers: new Headers(),
        body: Buffer.from(r.body),
        contentType: r.type ?? 'application/xml',
        redirected: false,
        elapsedMs: 1,
      }
    },
  }
}

describe('classify', () => {
  it('prepoznaje tipove strana na srpskom i engleskom', () => {
    expect(classifyPath('/')).toBe('home')
    expect(classifyPath('/o-nama/')).toBe('about')
    expect(classifyPath('/usluge/seo')).toBe('services')
    expect(classifyPath('/cenovnik')).toBe('pricing')
    expect(classifyPath('/blog')).toBe('blog_index')
    expect(classifyPath('/blog/kako-da-rangirate')).toBe('blog_post')
    expect(classifyPath('/2024/05/neki-tekst/')).toBe('blog_post')
    expect(classifyPath('/kontakt')).toBe('contact')
    expect(classifyPath('/politika-privatnosti')).toBe('legal')
    expect(classifyPath('/nesto-drugo')).toBe('other')
  })
  it('preskače fajlove, admin i korpu', () => {
    expect(shouldSkipUrl(new URL('https://a.rs/brosura.pdf'))).toBe(true)
    expect(shouldSkipUrl(new URL('https://a.rs/wp-admin/'))).toBe(true)
    expect(shouldSkipUrl(new URL('https://a.rs/?s=klima'))).toBe(true)
    expect(shouldSkipUrl(new URL('https://a.rs/usluge/'))).toBe(false)
  })
  it('kanonski ključ spaja www, http i kosu crtu', () => {
    expect(canonicalPageKey(new URL('http://www.a.rs/usluge/'))).toBe(
      canonicalPageKey(new URL('https://a.rs/usluge')),
    )
    expect(sameSite(new URL('https://www.a.rs'), new URL('https://a.rs/x'))).toBe(true)
    expect(sameSite(new URL('https://b.rs'), new URL('https://a.rs'))).toBe(false)
  })
})

const HOME_HTML = `<!doctype html><html lang="sr"><head><title>Fixture Studio | Digitalna agencija</title>
<meta name="description" content="Agencija za SEO i društvene mreže iz Beograda.">
<meta property="og:site_name" content="Fixture Studio"><meta property="og:image" content="/logo-og.png">
<meta name="theme-color" content="#ff6600">
<link rel="canonical" href="https://fixture.test/"><link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&family=Playfair+Display">
<link rel="alternate" type="application/rss+xml" href="/feed.xml"><link rel="apple-touch-icon" sizes="180x180" href="/apple.png">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Fixture Studio d.o.o.","logo":"https://fixture.test/logo.svg","email":"info@fixture.test","telephone":"+381 11 123 4567"}</script>
<style>.btn{background:#ff6600;color:#fff}</style></head>
<body><header><a href="/"><img src="/logo.svg" alt="Fixture logo" width="200" height="60"></a><nav><a href="/usluge/">Usluge</a><a href="/o-nama/">O nama</a><a href="/kontakt">Kontakt</a></nav></header>
<main><h1>Rast koji se meri</h1><p>${'Pomažemo malim biznisima da budu vidljivi na internetu. '.repeat(12)}</p>
<h2>SEO optimizacija</h2><p>Tehnički SEO, sadržaj i linkovi. Preko 120 klijenata od 2015. godine.</p>
<img src="/foto1.jpg" alt="Tim na sastanku" width="800" height="600"><img src="/pixel.gif" width="1" height="1">
<a href="/blog/prvi-tekst/">Prvi tekst</a><a href="https://fixture.test/usluge/#seo">SEO</a><a href="/brosura.pdf">PDF</a>
<a href="https://www.facebook.com/fixturestudio">Facebook</a><a href="https://www.instagram.com/fixturestudio/">Instagram</a>
<a href="https://www.facebook.com/sharer/sharer.php?u=x">Podeli</a><a href="https://drugi-sajt.rs/">Partner</a></main>
<footer><p>© 2024 Fixture Studio</p></footer><script src="/a.js"></script></body></html>`

describe('extractPage', () => {
  const page = extractPage(HOME_HTML, 'https://fixture.test/', 200)
  it('čita naslov, opis, jezik, kanonski URL, OG i theme-color', () => {
    expect(page.title).toBe('Fixture Studio | Digitalna agencija')
    expect(page.metaDescription).toContain('Agencija za SEO')
    expect(page.lang).toBe('sr')
    expect(page.canonicalUrl).toBe('https://fixture.test/')
    expect(page.openGraph['og:site_name']).toBe('Fixture Studio')
    expect(page.themeColor).toBe('#ff6600')
    expect(page.type).toBe('home')
  })
  it('izvlači JSON-LD, logo kandidate po skoru i ikone', () => {
    expect(page.jsonLd).toHaveLength(1)
    expect(page.logoCandidates[0]).toMatchObject({ src: 'https://fixture.test/logo.svg', reason: 'json-ld' })
    expect(page.logoCandidates.some((c) => c.reason === 'apple-touch-icon')).toBe(true)
    expect(page.iconLinks[0]?.href).toBe('https://fixture.test/apple.png')
  })
  it('tekst bez navigacije i futera, naslovi, broj reči', () => {
    expect(page.text).toContain('Rast koji se meri')
    expect(page.text).not.toContain('© 2024')
    expect(page.headings.h1).toEqual(['Rast koji se meri'])
    expect(page.headings.h2).toEqual(['SEO optimizacija'])
    expect(page.wordCount).toBeGreaterThan(60)
    expect(page.isSpaShell).toBe(false)
  })
  it('interni linkovi bez PDF-a i fragmenata, društvene mreže bez share linkova', () => {
    expect(page.internalLinks).toContain('https://fixture.test/usluge/')
    expect(page.internalLinks).toContain('https://fixture.test/blog/prvi-tekst/')
    expect(page.internalLinks.some((l) => l.endsWith('.pdf') || l.includes('#'))).toBe(false)
    expect(page.socialLinks).toEqual({
      facebook: 'https://www.facebook.com/fixturestudio',
      instagram: 'https://www.instagram.com/fixturestudio/',
    })
    expect(page.feedLinks).toEqual(['https://fixture.test/feed.xml'])
    expect(page.stylesheets).toHaveLength(2)
  })
  it('slike bez tracking piksela', () => {
    expect(page.images.map((i) => i.src)).toEqual([
      'https://fixture.test/logo.svg',
      'https://fixture.test/foto1.jpg',
    ])
  })
  it('prepoznaje SPA ljusku', () => {
    const spa = extractPage(
      '<html><body><div id="root"></div><script src=a></script><script src=b></script><script src=c></script></body></html>',
      'https://spa.test/',
      200,
    )
    expect(spa.isSpaShell).toBe(true)
  })
  it('dekodira charset iz headera ili meta taga', () => {
    const body = Buffer.from(
      '<html><head><meta charset="windows-1250"></head><body>Š</body></html>',
      'latin1',
    )
    expect(decodeHtml(Buffer.from('<p>čćž</p>'), 'text/html; charset=utf-8')).toContain('čćž')
    expect(typeof decodeHtml(body, 'text/html')).toBe('string')
  })
})

describe('discover', () => {
  it('parsira RSS i Atom', () => {
    const rss = parseFeed(
      `<rss><channel><item><title>Prvi</title><link>https://a.rs/blog/prvi/</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate><description><![CDATA[<p>Tekst</p>]]></description></item></channel></rss>`,
    )
    expect(rss).toEqual([
      {
        url: 'https://a.rs/blog/prvi/',
        title: 'Prvi',
        publishedAt: 'Mon, 01 Jan 2024 00:00:00 GMT',
        summary: 'Tekst',
      },
    ])
    const atom = parseFeed(
      `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>A</title><link href="https://a.rs/b/a"/><updated>2024-02-02T00:00:00Z</updated></entry></feed>`,
    )
    expect(atom[0]).toMatchObject({ url: 'https://a.rs/b/a', title: 'A' })
    expect(parseFeed('<html></html>')).toEqual([])
  })
  it('čita sitemap index rekurzivno', async () => {
    const d = deps({
      'https://a.rs/sitemap.xml': {
        body: `<sitemapindex><sitemap><loc>https://a.rs/post-sitemap.xml</loc></sitemap></sitemapindex>`,
      },
      'https://a.rs/post-sitemap.xml': {
        body: `<urlset><url><loc>https://a.rs/blog/x/</loc><lastmod>2024-03-01</lastmod></url></urlset>`,
      },
    })
    expect(await readSitemap(d, 'https://a.rs/sitemap.xml')).toEqual([
      { loc: 'https://a.rs/blog/x/', lastmod: '2024-03-01' },
    ])
  })
  it('spaja sitemap, feed i linkove, rangira i seče na limit', async () => {
    const urls = Array.from(
      { length: 40 },
      (_, i) =>
        `<url><loc>https://a.rs/blog/tekst-${i}/</loc><lastmod>2024-01-${String((i % 28) + 1).padStart(2, '0')}</lastmod></url>`,
    ).join('')
    const d = deps({
      'https://a.rs/sitemap.xml': {
        body: `<urlset><url><loc>https://a.rs/o-nama/</loc></url><url><loc>https://a.rs/cenovnik/</loc></url>${urls}</urlset>`,
      },
      'https://a.rs/feed/': {
        body: `<rss><channel><item><title>N</title><link>https://a.rs/blog/novi/</link></item></channel></rss>`,
      },
    })
    const r = await discoverUrls(
      {
        url: 'https://a.rs/',
        feedLinks: [],
        internalLinks: ['https://a.rs/usluge/', 'https://a.rs/o-nama', 'https://www.a.rs/kontakt/'],
      },
      [],
      12,
      d,
    )
    expect(r.urls).toHaveLength(12)
    expect(r.urls[0]).toMatchObject({ url: 'https://a.rs/', source: 'seed' })
    const types = r.urls.map((u) => u.type)
    expect(types.filter((t) => t === 'blog_post').length).toBe(7) // 5 ostalih strana + blog popunjava ostatak
    expect(types).toContain('about')
    expect(types).toContain('services')
    expect(types).toContain('contact')
    expect(r.urls.filter((u) => u.url.includes('o-nama'))).toHaveLength(1)
    expect(r.sitemapHash).toBeTruthy()
    expect(r.feedItems[0]?.url).toBe('https://a.rs/blog/novi/')
    expect(hashList(['b', 'a'])).toBe(hashList(['a', 'b']))
  })
})

describe('colors', () => {
  it('parsira hex, rgb i hsl', () => {
    expect(parseColorToken('#F60')).toBe('#ff6600')
    expect(parseColorToken('rgb(255, 102, 0)')).toBe('#ff6600')
    expect(parseColorToken('rgba(255 102 0 / 50%)')).toBe('#ff6600')
    expect(parseColorToken('hsl(24, 100%, 50%)')).toBe('#ff6600')
    expect(parseColorToken('red')).toBeNull()
  })
  it('neutralne boje, kontrast i spajanje sličnih', () => {
    expect(isNeutral('#ffffff')).toBe(true)
    expect(isNeutral('#333333')).toBe(true)
    expect(isNeutral('#ff6600')).toBe(false)
    expect(contrastRatio('#000000', '#ffffff')).toBe(21)
    const merged = mergeSimilar([
      { hex: '#ff6600', weight: 1, source: 'a' },
      { hex: '#ff6a05', weight: 2, source: 'a' },
      { hex: '#0033aa', weight: 1, source: 'a' },
    ])
    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({ hex: '#ff6a05', weight: 3 })
  })
  it('CSS varijable brenda i dugmad teže više; paleta bira primarnu', () => {
    const css = `:root{--brand-primary:#ff6600;--gray:#777} .btn{background:#ff6600;color:#fff} p{color:#222} a{color:#0033aa}`
    const colors = parseCssColors(css)
    const palette = buildPalette({ css: colors, logo: [], themeColor: '#ff6600' })
    expect(palette.primary).toBe('#ff6600')
    expect(palette.secondary).toBe('#0033aa')
    expect(palette.isMonochrome).toBe(false)
    expect(palette.contrast.textOnPrimary).toMatch(/^#/)
    const mono = buildPalette({ css: parseCssColors('p{color:#222} body{background:#fff}'), logo: [] })
    expect(mono.isMonochrome).toBe(true)
  })
})

describe('fonts', () => {
  it('Google Fonts iz linka, body i naslovi iz CSS-a, mapiranje komercijalnih', () => {
    expect(
      googleFontsFromUrls([
        'https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&family=Playfair+Display',
      ]),
    ).toEqual(['Poppins', 'Playfair Display'])
    const info = extractFonts(
      ['https://fonts.googleapis.com/css?family=Poppins'],
      `body{font-family:"Proxima Nova", Arial, sans-serif} h1,h2{font-family:'Playfair Display', serif}`,
    )
    expect(info.body).toBe('Proxima Nova')
    expect(info.headings).toBe('Playfair Display')
    expect(info.mappedBody).toBe('Montserrat')
    expect(info.mappedHeadings).toBe('Playfair Display')
    expect(mapToGoogleFont('Helvetica Neue', 'Inter')).toBe('Inter')
    expect(mapToGoogleFont('Nepoznat Font', 'Inter')).toBe('Inter')
  })
})

describe('chunkText', () => {
  it('deli po pasusima sa preklopom i preskače mrvice', () => {
    const para = 'Rečenica broj jedan o uslugama. '.repeat(40).trim()
    const text = [para, para, para, 'kratko'].join('\n\n')
    const chunks = chunkText(text, { size: 1500, overlap: 100 })
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(1700)
    expect(chunks[1]!.content.startsWith(chunks[0]!.content.slice(-100).slice(0, 30))).toBe(true)
    expect(chunkText('mali tekst')).toEqual([])
  })
})

describe('sanitizeSvg', () => {
  it('uklanja skripte, event handlere i spoljne reference', () => {
    const dirty = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><image xlink:href="https://evil.test/x.png"/><a href="#ok"><rect width="10" height="10" fill="#f60"/></a><foreignObject><div>x</div></foreignObject></svg>`
    const clean = sanitizeSvg(dirty)
    expect(clean).not.toMatch(/script|onload|evil\.test|foreignObject/)
    expect(clean).toContain('href="#ok"')
    expect(() => sanitizeSvg('<html></html>')).toThrow()
  })
})
