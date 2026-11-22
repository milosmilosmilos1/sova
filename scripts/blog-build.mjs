/**
 * Blog (D-186): proverava članke iz src/content/blog/{sr,en}/*.md i pravi podatke za sajt.
 *
 *   node scripts/blog-build.mjs           proveri i upiši src/content/blog/generated/*.json
 *   node scripts/blog-build.mjs --check   samo proveri i javi ako upisani podaci nisu ažurni
 *
 * Srpski članak je izvor; engleski ima `izvor: <srpski slug>` i svoj slug. Linkovi u tekstu:
 * `(@srpski-slug)` je drugi članak (na jeziku strane), `(/register)` i `(/#pricing)` su strane sajta,
 * `(https://…)` je spoljni link. Slike su `!slika:<ključ>` iz images.json, fajlovi u public/blog.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { blockInlines, faqFrom, parseDoc, wordCount } from '../src/lib/blog/markdown.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT = path.join(ROOT, 'src/content/blog')
const OUT = path.join(CONTENT, 'generated')
const PUBLIC = path.join(ROOT, 'public/blog')

const LOCALES = {
  sr: {
    app: 'sr-Latn',
    minWords: 1000,
    faq: 'Česta pitanja',
    fields: ['slug', 'naslov', 'seo_naslov', 'seo_opis', 'izvod', 'kategorija', 'naslovna', 'datum'],
  },
  en: {
    app: 'en',
    minWords: 900,
    faq: 'Frequently asked questions',
    fields: ['izvor', 'slug', 'naslov', 'seo_naslov', 'seo_opis', 'izvod', 'naslovna'],
  },
}
const CATEGORIES = ['strategija', 'sadrzaj', 'mreze', 'ai-i-automatizacija']
const SITE_PATHS = new Set(['/', '/register', '/login', '/kontakt', '/blog', '/privacy', '/terms'])
const SECTIONS = new Set(['features', 'networks', 'how', 'pricing', 'faq'])

/** Fraze koje odaju šablonski tekst (isto kao seo/blog/izgradi.py, uz englesku listu vlasnika). */
const BANNED = [
  'u današnjem svetu',
  'u današnje vreme',
  'u ovom članku ćemo',
  'u ovom tekstu ćemo',
  'nije tajna da',
  'bez sumnje',
  'zaključno',
  'na kraju dana',
  'igra menja',
  'delve',
  'unpack',
  "in today's",
  'in this article',
  'game-changer',
  'game changer',
  'seamless',
  'navigate the complexities',
  'unlock the',
  "it's important to note",
  'moreover',
  'furthermore',
  'additionally,',
  'in conclusion',
  'ultimately',
  'at the end of the day',
  'elevate your',
  'synerg',
  'foster a culture',
  'robust',
  'leverage',
]

const errors = []
const fail = (file, msg) => errors.push(`${file}: ${msg}`)

function walkLinks(nodes, cb) {
  for (const n of nodes) {
    if (n.type === 'link') cb(n.href)
    if (n.type !== 'text') walkLinks(n.children, cb)
  }
}
function countStrong(nodes) {
  return nodes.reduce(
    (s, n) => s + (n.type === 'strong' ? 1 : 0) + (n.type === 'text' ? 0 : countStrong(n.children)),
    0,
  )
}

const images = JSON.parse(readFileSync(path.join(CONTENT, 'images.json'), 'utf8'))
for (const [key, img] of Object.entries(images)) {
  const files = img.localized ? [`${key}.webp`, `${key}-en.webp`] : [`${key}.webp`]
  for (const f of files)
    if (!existsSync(path.join(PUBLIC, f))) fail('images.json', `nema fajla public/blog/${f}`)
  if (!img.width || !img.height) fail('images.json', `${key}: nema širine ili visine`)
  if (!img.alt?.sr || !img.alt?.en) fail('images.json', `${key}: alt mora na oba jezika`)
}

function read(locale) {
  const dir = path.join(CONTENT, locale)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const source = readFileSync(path.join(dir, f), 'utf8')
      const { meta, blocks } = parseDoc(source)
      const body = source
        .replace(/^﻿/, '')
        .replace(/\r\n?/g, '\n')
        .replace(/^---\n[\s\S]*?\n---\n?/, '')
      return { file: `${locale}/${f}`, locale, meta, blocks, body: body.trim() + '\n', source }
    })
}

const sr = read('sr')
const en = read('en')
const srSlugs = new Set(sr.map((d) => d.meta.slug))

function check(doc) {
  const cfg = LOCALES[doc.locale]
  const { file, meta, blocks, source } = doc
  for (const f of cfg.fields) if (!meta[f]) fail(file, `nema polja ${f}`)
  if (doc.locale === 'sr' && `${meta.slug}.md` !== path.basename(file)) fail(file, 'ime fajla mora biti slug')
  if (doc.locale === 'en' && `${meta.izvor}.md` !== path.basename(file))
    fail(file, 'ime fajla mora biti srpski slug (izvor)')
  if (meta.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.slug)) fail(file, `slug ${meta.slug} nije ispravan`)
  if ((meta.seo_naslov ?? '').length > 60)
    fail(file, `seo_naslov ima ${meta.seo_naslov.length} znakova (najviše 60)`)
  const d = (meta.seo_opis ?? '').length
  if (d < 120 || d > 160) fail(file, `seo_opis ima ${d} znakova (120 do 160)`)
  if (doc.locale === 'sr' && !CATEGORIES.includes(meta.kategorija))
    fail(file, `nepoznata kategorija ${meta.kategorija}`)
  if (meta.naslovna && !images[meta.naslovna]) fail(file, `naslovna ${meta.naslovna} nije u images.json`)

  if (/[–—]/.test(source)) fail(file, 'ima dugu ili srednju crtu (— ili –)')
  if (/ - /.test(source)) fail(file, 'ima crticu sa razmacima umesto crte')
  if (/[Ѐ-ӿ]/.test(source)) fail(file, 'ima ćirilicu')
  const lower = source.toLowerCase()
  for (const b of BANNED) if (lower.includes(b)) fail(file, `šablonska fraza „${b}”`)
  if (/^(- |\d+\. )\*\*[^*]+[:.]\*\*/m.test(source) || /^(- |\d+\. )\*\*[^*]+\*\*\s*[:.]/m.test(source))
    fail(file, 'lista „**Reč:** objašnjenje”')

  const words = wordCount(blocks)
  if (words < cfg.minWords) fail(file, `${words} reči (najmanje ${cfg.minWords})`)
  const inlines = blocks.flatMap(blockInlines)
  const strong = inlines.reduce((s, n) => s + countStrong(n), 0)
  if (strong < 6) fail(file, `${strong} podebljanih delova (najmanje 6)`)

  const internal = new Set()
  let internalCount = 0
  for (const nodes of inlines)
    walkLinks(nodes, (href) => {
      if (href.startsWith('@')) {
        if (!srSlugs.has(href.slice(1))) fail(file, `link na nepostojeći članak ${href}`)
        if (href.slice(1) === (doc.locale === 'sr' ? meta.slug : meta.izvor)) fail(file, 'link na samog sebe')
        internal.add(href)
        internalCount++
      } else if (href.startsWith('/')) {
        const [p, hash] = href.split('#')
        if (!SITE_PATHS.has(p)) fail(file, `link na nepoznatu stranu ${href}`)
        if (hash !== undefined && (p !== '/' || !SECTIONS.has(hash))) fail(file, `nepoznata sekcija ${href}`)
        internal.add(href)
        internalCount++
      } else if (!/^https:\/\/[^\s]+$/.test(href)) fail(file, `link ${href} nije ni interni ni https`)
    })
  if (internalCount < 6 || internal.size < 4)
    fail(file, `${internalCount} internih linkova na ${internal.size} adresa (najmanje 6 na 4)`)

  const pics = blocks.filter((b) => b.type === 'image')
  for (const p of pics) if (!images[p.key]) fail(file, `slika ${p.key} nije u images.json`)
  if (pics.length < 2) fail(file, `${pics.length} slika u tekstu (najmanje 2 uz naslovnu)`)
  if (!blocks.some((b) => b.type === 'summary')) fail(file, 'nema okvira :::ukratko')
  if (blocks[0]?.type !== 'p') fail(file, 'prvi blok mora biti pasus sa direktnim odgovorom')
  const faq = faqFrom(blocks, cfg.faq)
  if (faq.length < 3) fail(file, `${faq.length} pitanja u odeljku „${cfg.faq}” (najmanje 3)`)
  if (
    blocks.some((b) => b.type === 'h2' && b.text === cfg.faq) &&
    blocks.findLast((b) => b.type === 'h2')?.text !== cfg.faq
  )
    fail(file, `„${cfg.faq}” mora biti poslednji H2`)
  return words
}

const posts = []
for (const doc of sr) {
  const words = check(doc)
  posts.push({
    locale: 'sr-Latn',
    id: doc.meta.slug,
    slug: doc.meta.slug,
    title: doc.meta.naslov,
    seoTitle: doc.meta.seo_naslov,
    description: doc.meta.seo_opis,
    excerpt: doc.meta.izvod,
    category: doc.meta.kategorija,
    cover: doc.meta.naslovna,
    date: doc.meta.datum,
    updated: doc.meta.izmena || doc.meta.datum,
    order: Number(doc.meta.redosled || 99),
    words,
    body: doc.body,
  })
}
const enSlugs = new Set()
for (const doc of en) {
  const words = check(doc)
  const source = sr.find((d) => d.meta.slug === doc.meta.izvor)
  if (!source) {
    fail(doc.file, `izvor ${doc.meta.izvor} ne postoji među srpskim člancima`)
    continue
  }
  if (enSlugs.has(doc.meta.slug)) fail(doc.file, `slug ${doc.meta.slug} je već zauzet`)
  enSlugs.add(doc.meta.slug)
  posts.push({
    locale: 'en',
    id: source.meta.slug,
    slug: doc.meta.slug,
    title: doc.meta.naslov,
    seoTitle: doc.meta.seo_naslov,
    description: doc.meta.seo_opis,
    excerpt: doc.meta.izvod,
    category: source.meta.kategorija,
    cover: doc.meta.naslovna,
    date: source.meta.datum,
    updated: doc.meta.izmena || source.meta.izmena || source.meta.datum,
    order: Number(source.meta.redosled || 99),
    words,
    body: doc.body,
  })
}
for (const doc of sr)
  if (!en.some((d) => d.meta.izvor === doc.meta.slug)) fail(doc.file, 'nema engleski prevod u en/')

// --nacrt: dok se prevodi, srpski članak bez engleskog ne zaustavlja upis (lokalni rad, ne za komit)
if (process.argv.includes('--nacrt')) {
  for (let i = errors.length - 1; i >= 0; i--)
    if (errors[i].endsWith('nema engleski prevod u en/')) errors.splice(i, 1)
}
if (errors.length) {
  console.error(`Blog: ${errors.length} grešaka\n` + errors.map((e) => `  ${e}`).join('\n'))
  process.exit(1)
}

const usedImages = new Set()
for (const p of posts) {
  usedImages.add(p.cover)
  for (const m of p.body.matchAll(/^!slika:([a-z0-9-]+)$/gm)) usedImages.add(m[1])
}
const outPosts =
  JSON.stringify(
    {
      posts,
      images: Object.fromEntries(Object.entries(images).filter(([k]) => usedImages.has(k))),
    },
    null,
    1,
  ) + '\n'
const outSlugs =
  JSON.stringify(
    Object.fromEntries(posts.filter((p) => p.locale === 'en').map((p) => [p.id, p.slug])),
    null,
    1,
  ) + '\n'

const targets = [
  [path.join(OUT, 'posts.json'), outPosts],
  [path.join(OUT, 'slugs.json'), outSlugs],
]
if (process.argv.includes('--check')) {
  const stale = targets.filter(([f, text]) => !existsSync(f) || readFileSync(f, 'utf8') !== text)
  if (stale.length) {
    console.error(
      `Blog: podaci nisu ažurni (${stale.map(([f]) => path.relative(ROOT, f)).join(', ')}). Pokrenite: node scripts/blog-build.mjs`,
    )
    process.exit(1)
  }
  console.log(`Blog: ${sr.length} srpskih i ${en.length} engleskih članaka, podaci ažurni.`)
} else {
  mkdirSync(OUT, { recursive: true })
  for (const [f, text] of targets) writeFileSync(f, text)
  console.log(`Blog: ${sr.length} srpskih i ${en.length} engleskih članaka upisano.`)
}
