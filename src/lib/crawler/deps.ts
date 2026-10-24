import { safeFetch } from '@/lib/ssrf'

import type { CrawlDeps } from './types'

let override: CrawlDeps | null = null

/** Zavisnosti crawlera; testovi ih zamenjuju (MSW fetch + DNS stub). */
export function getCrawlDeps(): CrawlDeps {
  return override ?? { fetch: safeFetch, now: Date.now }
}

export function setCrawlDepsForTests(deps: CrawlDeps | null): void {
  override = deps
}
