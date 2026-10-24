import 'server-only'

import * as cheerio from 'cheerio'

import { safeFetch, type SafeFetchFn } from '@/lib/ssrf'

/**
 * Naslov i opis stranice za objave sa linkom na mrežama koje ne čitaju link same
 * (LinkedIn Posts API ne radi scraping, pa naslov članka šalje Sova). SSRF zaštita i limit veličine
 * iz `safeFetch`; svaka greška daje naslov iz domena, jer objava ne sme da padne zbog pregleda.
 */
export interface LinkPreview {
  title: string
  description: string | null
}

const clean = (s: string | undefined | null) => (s ?? '').replace(/\s+/g, ' ').trim()

export async function fetchLinkPreview(
  url: string,
  fetchImpl: SafeFetchFn = safeFetch,
): Promise<LinkPreview> {
  let host = url
  try {
    host = new URL(url).hostname.replace(/^www[.]/, '')
  } catch {
    return { title: url.slice(0, 200), description: null }
  }
  try {
    const res = await fetchImpl(url, { timeoutMs: 6_000, maxBytes: 1_000_000 })
    if (!res.ok || !res.contentType.includes('html')) return { title: host, description: null }
    const $ = cheerio.load(res.body.toString('utf8'))
    const title =
      clean($('meta[property="og:title"]').attr('content')) ||
      clean($('meta[name="twitter:title"]').attr('content')) ||
      clean($('title').first().text()) ||
      host
    const description =
      clean($('meta[property="og:description"]').attr('content')) ||
      clean($('meta[name="description"]').attr('content')) ||
      null
    return { title: title.slice(0, 200), description: description ? description.slice(0, 300) : null }
  } catch {
    return { title: host, description: null }
  }
}
