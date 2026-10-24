import { http, HttpResponse } from 'msw'
import sharp from 'sharp'

/**
 * Lažni sajt za integracione testove Brand Brain-a: https://fixture-site.test
 * (MSW presreće fetch, DNS se zamenjuje stubom u testu). Stanje je promenljivo da bi
 * nedeljna provera mogla da „doda” novu objavu.
 */
export const FIXTURE_ORIGIN = 'https://fixture-site.test'
export const BLOCKED_ORIGIN = 'https://blocked-site.test'

export const fixtureState = {
  extraPosts: [] as Array<{ slug: string; title: string }>,
  /** naziv u JSON-LD, menja se da druga analiza da drugačiji rezultat */
  orgName: 'Fixture Studio d.o.o.',
}

const layout = (title: string, body: string, extraHead = '') => `<!doctype html><html lang="sr"><head>
<meta charset="utf-8"><title>${title} | Fixture Studio</title>
<meta name="description" content="Fixture Studio je agencija za SEO i društvene mreže iz Beograda koja pomaže malim biznisima da rastu.">
<meta property="og:site_name" content="Fixture Studio"><meta name="theme-color" content="#ff6600">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&family=Playfair+Display">
<link rel="alternate" type="application/rss+xml" href="/feed.xml">${extraHead}
</head><body>
<header><a href="/"><img src="/logo.svg" alt="Fixture Studio logo" width="200" height="60"></a>
<nav><a href="/">Početna</a><a href="/usluge/">Usluge</a><a href="/o-nama/">O nama</a><a href="/cenovnik/">Cenovnik</a><a href="/blog/">Blog</a><a href="/kontakt/">Kontakt</a></nav></header>
<main>${body}</main>
<footer><p>© 2024 Fixture Studio d.o.o. Bulevar 1, Beograd</p>
<a href="https://www.facebook.com/fixturestudio">Facebook</a><a href="https://www.instagram.com/fixturestudio/">Instagram</a><a href="https://www.linkedin.com/company/fixture-studio">LinkedIn</a></footer>
</body></html>`

const para = (s: string, n = 6) =>
  `<p>${Array.from({ length: n }, (_, i) => `${s} (${i + 1}).`).join(' ')}</p>`

const JSON_LD = () =>
  `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: fixtureState.orgName,
    url: `${FIXTURE_ORIGIN}/`,
    logo: `${FIXTURE_ORIGIN}/logo.svg`,
    email: 'info@fixture-site.test',
    telephone: '+381 11 123 4567',
    foundingDate: '2015-03-01',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Bulevar 1',
      addressLocality: 'Beograd',
      addressCountry: 'RS',
    },
  })}</script>`

const pages: Record<string, () => string> = {
  '/': () =>
    layout(
      'Digitalna agencija',
      `<h1>Rast koji se meri</h1>${para('Pomažemo malim biznisima u Srbiji da budu vidljivi na internetu i da iz posete naprave upit', 8)}
<h2>SEO optimizacija</h2>${para('Tehnički SEO, sadržaj i linkovi koji donose rezultate', 4)}
<h2>Društvene mreže</h2>${para('Objave, oglasi i zajednica koja vam veruje', 4)}
<p>Preko 120 klijenata od 2015. godine veruje našem timu. Zakažite besplatne konsultacije već danas.</p>
<img src="/foto1.jpg" alt="Tim na sastanku" width="640" height="480"><img src="/foto2.jpg" alt="Kancelarija" width="640" height="480">
<img src="/foto3.jpg" alt="Radionica" width="640" height="480"><img src="/foto4.jpg" alt="Klijent" width="640" height="480">`,
      JSON_LD(),
    ),
  '/usluge/': () =>
    layout(
      'Usluge',
      `<h1>Usluge</h1><h2>SEO optimizacija</h2>${para('Tehnički pregled sajta, ključne reči, sadržaj i linkovi', 3)}
<h2>Google oglasi</h2>${para('Kampanje koje donose upite uz jasan budžet', 3)}<h2>Društvene mreže</h2>${para('Plan objava, dizajn i oglasi', 3)}
<h2>Izrada sajtova</h2>${para('Brzi sajtovi spremni za pretraživače', 3)}`,
    ),
  '/o-nama/': () =>
    layout(
      'O nama',
      `<h1>O nama</h1>${para('Fixture Studio je osnovan 2015. godine u Beogradu i okuplja tim od 12 ljudi', 6)}<p>Obraćamo vam se jasno i bez praznih obećanja. Vaš rezultat je naše merilo.</p>`,
    ),
  '/cenovnik/': () =>
    layout(
      'Cenovnik',
      `<h1>Cenovnik</h1><p>SEO paketi počinju od 150 € mesečno. Google oglasi od 100 € mesečno uz budžet za oglase. Garancija povraćaja novca 30 dana.</p>${para('Cena zavisi od obima posla', 3)}`,
    ),
  '/blog/': () =>
    layout(
      'Blog',
      `<h1>Blog</h1><ul><li><a href="/blog/kako-da-rangirate-lokalno/">Kako da rangirate lokalno</a></li><li><a href="/blog/instagram-za-male-biznise/">Instagram za male biznise</a></li>${fixtureState.extraPosts
        .map((p) => `<li><a href="/blog/${p.slug}/">${p.title}</a></li>`)
        .join('')}</ul>`,
    ),
  '/blog/kako-da-rangirate-lokalno/': () =>
    layout(
      'Kako da rangirate lokalno',
      `<article><h1>Kako da rangirate lokalno</h1>${para('Lokalni SEO počinje Google poslovnim profilom i doslednim podacima o firmi', 10)}</article>`,
      '<meta property="article:published_time" content="2024-05-01T10:00:00Z">',
    ),
  '/blog/instagram-za-male-biznise/': () =>
    layout(
      'Instagram za male biznise',
      `<article><h1>Instagram za male biznise</h1>${para('Reels, karuseli i priče koje grade poverenje bez velikog budžeta', 10)}</article>`,
      '<meta property="article:published_time" content="2024-06-01T10:00:00Z">',
    ),
  '/kontakt/': () =>
    layout(
      'Kontakt',
      `<h1>Kontakt</h1><p>Pišite nam na info@fixture-site.test ili pozovite +381 11 123 4567. Radno vreme: ponedeljak–petak 9–17 h.</p>${para('Odgovaramo u roku od jednog radnog dana', 2)}`,
    ),
  '/politika-privatnosti/': () =>
    layout(
      'Politika privatnosti',
      `<h1>Politika privatnosti</h1>${para('Pravni tekst o kolačićima i obradi podataka', 10)}`,
    ),
}
for (const p of fixtureState.extraPosts) {
  pages[`/blog/${p.slug}/`] = () =>
    layout(p.title, `<article><h1>${p.title}</h1>${para('Nov tekst', 10)}</article>`)
}

const sitemap = () =>
  `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[
    ...Object.keys(pages),
    ...fixtureState.extraPosts.map((p) => `/blog/${p.slug}/`),
  ]
    .map((p) => `<url><loc>${FIXTURE_ORIGIN}${p}</loc><lastmod>2024-06-01</lastmod></url>`)
    .join('')}</urlset>`

const feed = () =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture blog</title>${[
    {
      slug: 'instagram-za-male-biznise',
      title: 'Instagram za male biznise',
      date: 'Sat, 01 Jun 2024 10:00:00 GMT',
    },
    {
      slug: 'kako-da-rangirate-lokalno',
      title: 'Kako da rangirate lokalno',
      date: 'Wed, 01 May 2024 10:00:00 GMT',
    },
    ...fixtureState.extraPosts.map((p) => ({ ...p, date: 'Mon, 01 Jul 2024 10:00:00 GMT' })),
  ]
    .map(
      (p) =>
        `<item><title>${p.title}</title><link>${FIXTURE_ORIGIN}/blog/${p.slug}/</link><pubDate>${p.date}</pubDate></item>`,
    )
    .join('')}</channel></rss>`

const CSS = `:root{--brand-primary:#ff6600;--brand-secondary:#003366;--gray-100:#f5f5f5}
body{font-family:"Poppins",Arial,sans-serif;color:#222;background:#fff}
h1,h2{font-family:"Playfair Display",Georgia,serif}
.btn{background:#ff6600;color:#fff} a{color:#003366} .badge{background:#00a86b}`

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" viewBox="0 0 200 60"><rect width="200" height="60" rx="8" fill="#ff6600"/><rect x="10" y="10" width="40" height="40" fill="#003366"/><text x="60" y="38" font-size="20" fill="#ffffff">Fixture</text></svg>`

const photoCache = new Map<string, Buffer>()
async function photo(name: string): Promise<Buffer> {
  let buf = photoCache.get(name)
  if (!buf) {
    const colors: Record<string, { r: number; g: number; b: number }> = {
      foto1: { r: 200, g: 120, b: 60 },
      foto2: { r: 60, g: 90, b: 140 },
      foto3: { r: 120, g: 160, b: 90 },
      foto4: { r: 180, g: 70, b: 90 },
    }
    buf = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: colors[name] ?? { r: 128, g: 128, b: 128 },
      },
    })
      .jpeg({ quality: 70 })
      .toBuffer()
    photoCache.set(name, buf)
  }
  return buf
}

const html = (body: string) =>
  new HttpResponse(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })

export const fixtureHandlers = [
  http.get(
    `${FIXTURE_ORIGIN}/robots.txt`,
    () =>
      new HttpResponse(
        `User-agent: *\nDisallow: /wp-admin/\nDisallow: /politika-privatnosti/\n\nSitemap: ${FIXTURE_ORIGIN}/sitemap.xml\n`,
        {
          headers: { 'content-type': 'text/plain' },
        },
      ),
  ),
  http.get(
    `${FIXTURE_ORIGIN}/sitemap.xml`,
    () => new HttpResponse(sitemap(), { headers: { 'content-type': 'application/xml' } }),
  ),
  http.get(
    `${FIXTURE_ORIGIN}/feed.xml`,
    () => new HttpResponse(feed(), { headers: { 'content-type': 'application/rss+xml' } }),
  ),
  http.get(
    `${FIXTURE_ORIGIN}/feed/`,
    () => new HttpResponse(feed(), { headers: { 'content-type': 'application/rss+xml' } }),
  ),
  http.get(
    `${FIXTURE_ORIGIN}/style.css`,
    () => new HttpResponse(CSS, { headers: { 'content-type': 'text/css' } }),
  ),
  http.get(
    `${FIXTURE_ORIGIN}/logo.svg`,
    () => new HttpResponse(LOGO_SVG, { headers: { 'content-type': 'image/svg+xml' } }),
  ),
  http.get(`${FIXTURE_ORIGIN}/:name.jpg`, async ({ params }) => {
    const buf = await photo(String(params.name))
    return new HttpResponse(new Uint8Array(buf), { headers: { 'content-type': 'image/jpeg' } })
  }),
  http.get(`${FIXTURE_ORIGIN}/*`, ({ request }) => {
    const path = new URL(request.url).pathname
    if (path === '/preusmeri/')
      return new HttpResponse(null, { status: 301, headers: { location: '/o-nama/' } })
    const page =
      pages[path] ??
      (path.startsWith('/blog/')
        ? fixtureState.extraPosts.find((p) => `/blog/${p.slug}/` === path) &&
          (() => layout('Nov tekst', `<article><h1>Nov tekst</h1>${para('Nov tekst', 10)}</article>`))
        : undefined)
    if (!page)
      return new HttpResponse('<html><body><h1>404</h1></body></html>', {
        status: 404,
        headers: { 'content-type': 'text/html' },
      })
    return html(page())
  }),
  http.get(
    `${BLOCKED_ORIGIN}/robots.txt`,
    () => new HttpResponse('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain' } }),
  ),
  http.get(`${BLOCKED_ORIGIN}/*`, () =>
    html(layout('Blokiran', '<h1>Blokiran sajt</h1><p>Ovo ne sme da se čita.</p>')),
  ),
]

/** Gemini embeddings: deterministični vektori dužine 1536. */
export const embedHandler = http.post(
  /generativelanguage\.googleapis\.com\/v1beta\/models\/[^/:]+:(batchEmbedContents|embedContent)/,
  async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      requests?: unknown[]
      content?: unknown
      contents?: unknown[]
    }
    const count = body.requests?.length ?? body.contents?.length ?? 1
    const vector = (seed: number) => Array.from({ length: 1536 }, (_, i) => Math.sin(seed + i / 7) / 10)
    if (request.url.includes(':embedContent')) return HttpResponse.json({ embedding: { values: vector(1) } })
    return HttpResponse.json({
      embeddings: Array.from({ length: count }, (_, i) => ({ values: vector(i + 1) })),
    })
  },
)

export const photoStyleReply = {
  summary: 'Tople, prirodne fotografije ljudi u radnom okruženju.',
  subjects: ['tim', 'kancelarija'],
  lighting: 'prirodno dnevno svetlo',
  mood: 'toplo i opušteno',
  composition: 'srednji planovi, plitka dubina',
  color_treatment: 'topli tonovi, blag kontrast',
  has_people: true,
  avoid: ['neonske boje', 'stock osmesi'],
  image_prompt_suffix: 'natural daylight, warm tones, candid people at work, shallow depth of field, no text',
  confidence: 0.7,
}

const f = (value: unknown, confidence = 0.85) => ({ value, confidence, source_urls: [`${FIXTURE_ORIGIN}/`] })
export function profileReply(over: { name?: string; description?: string } = {}) {
  return {
    identity: {
      name: f(over.name ?? 'Fixture Studio'),
      tagline: f('Rast koji se meri'),
      description: f(
        over.description ??
          'Fixture Studio je agencija za SEO i društvene mreže iz Beograda. Pomažemo malim biznisima da budu vidljivi i da iz posete naprave upit.',
      ),
      industry: f('Digitalni marketing'),
      city: f('Beograd'),
      country: f('Srbija'),
      founded_year: f(2015),
      languages: f(['sr']),
    },
    offer: {
      services: f([
        { name: 'SEO optimizacija', description: 'Tehnički pregled, ključne reči, sadržaj i linkovi' },
        { name: 'Google oglasi', description: 'Kampanje uz jasan budžet' },
        { name: 'Društvene mreže', description: 'Plan objava, dizajn i oglasi' },
        { name: 'Izrada sajtova', description: 'Brzi sajtovi spremni za pretraživače' },
      ]),
      products: f([]),
      differentiators: f(['Preko 120 klijenata od 2015. godine', 'Besplatne konsultacije']),
      price_hints: f(['SEO paketi od 150 € mesečno', 'Google oglasi od 100 € mesečno']),
      guarantees: f(['Garancija povraćaja novca 30 dana']),
    },
    audience: {
      segments: f([
        { name: 'Mali biznisi u Srbiji', description: 'Lokalne firme koje žele upite sa interneta' },
      ]),
      pain_points: f(['Nevidljivost na Google-u', 'Nejasan povraćaj ulaganja u oglase']),
      market: f('b2b'),
    },
    voice: {
      tone: f(['jasan', 'stručan', 'bez praznih obećanja']),
      address: f('vi'),
      formality: f('neutral'),
      emoji: f(false),
      sample_phrases: f(['Rast koji se meri', 'Vaš rezultat je naše merilo']),
      key_terms: f(['SEO', 'Google poslovni profil', 'upit']),
      hashtags: f(['#seo', '#digitalnimarketing', '#beograd']),
      words_to_avoid: f(['najjeftinije', 'garantovano prvo mesto']),
    },
    facts: f([
      { claim: 'Preko 120 klijenata od 2015. godine', source_url: `${FIXTURE_ORIGIN}/` },
      { claim: 'Tim od 12 ljudi', source_url: `${FIXTURE_ORIGIN}/o-nama/` },
    ]),
    contact: {
      email: f('info@fixture-site.test'),
      phone: f('+381 11 123 4567'),
      address: f('Bulevar 1, Beograd'),
      working_hours: f('ponedeljak–petak 9–17 h'),
    },
    content: {
      blog_topics: f(['Lokalni SEO', 'Instagram za male biznise']),
      content_pillars: f([
        { name: 'Edukacija', description: 'Saveti o SEO-u i mrežama' },
        { name: 'Rezultati', description: 'Studije slučaja i brojke' },
        { name: 'Tim', description: 'Ljudi iza agencije' },
      ]),
    },
  }
}
