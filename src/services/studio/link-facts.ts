import 'server-only'

import type { StudioLinkFacts } from '@/lib/ai/prompts/studio'
import { getCrawlDeps } from '@/lib/crawler/deps'
import { fetchPage, isFailure } from '@/lib/crawler/fetch-page'
import { productFromJsonLd } from '@/lib/studio/link'

/**
 * Stranica sa linka iz poruke (D-116): naslov, opis, cena proizvoda i početak teksta za Sovin
 * kontekst. SSRF zaštita i limit veličine iz crawlera; stranica koja se ne otvori ne obara poruku.
 */
const clip = (v: string | null | undefined, max: number) => {
  const t = (v ?? '').replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
}

export async function fetchLinkFacts(url: string): Promise<StudioLinkFacts> {
  const page = await fetchPage(url, getCrawlDeps(), { timeoutMs: 8_000, maxBytes: 2_000_000 })
  if (isFailure(page)) return { url, title: null, description: null, price: null, text: null, failed: true }
  const product = productFromJsonLd(page.jsonLd)
  return {
    url,
    title: clip(product?.name ?? page.openGraph['og:title'] ?? page.title, 200),
    description: clip(product?.description ?? page.openGraph['og:description'] ?? page.metaDescription, 500),
    price: product?.price ?? null,
    text: clip(page.text, 1500),
    failed: false,
  }
}
