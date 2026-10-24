import robotsParser from 'robots-parser'

import { SsrfError } from '@/lib/ssrf'

import type { CrawlDeps } from './types'

export interface RobotsInfo {
  fetched: boolean
  isAllowed: (url: string) => boolean
  crawlDelayMs: number | null
  sitemaps: string[]
  /** true kad robots.txt zabranjuje ceo sajt za nas user-agent */
  blocksEverything: boolean
  text: string | null
}

const UA_TOKEN = 'SovaBot'

/** Učitava i tumači robots.txt; nedostupan robots = sve dozvoljeno (standardno ponašanje). */
export async function loadRobots(origin: string, deps: CrawlDeps): Promise<RobotsInfo> {
  const robotsUrl = new URL('/robots.txt', origin).toString()
  let text: string | null = null
  try {
    const res = await deps.fetch(robotsUrl, { timeoutMs: 6_000, maxBytes: 256 * 1024 })
    if (res.ok && !res.contentType.includes('text/html')) text = res.body.toString('utf8')
  } catch (error) {
    if (error instanceof SsrfError && error.code === 'BLOCKED_HOST') throw error
    text = null
  }
  if (text === null) {
    return {
      fetched: false,
      isAllowed: () => true,
      crawlDelayMs: null,
      sitemaps: [],
      blocksEverything: false,
      text: null,
    }
  }
  const parser = robotsParser(robotsUrl, text)
  const isAllowed = (url: string) => parser.isAllowed(url, UA_TOKEN) ?? true
  const delay = parser.getCrawlDelay(UA_TOKEN)
  const sitemaps = parser.getSitemaps()
  const blocksEverything = !isAllowed(new URL('/', origin).toString())
  return {
    fetched: true,
    isAllowed,
    crawlDelayMs: typeof delay === 'number' && delay > 0 ? Math.min(delay * 1000, 10_000) : null,
    sitemaps,
    blocksEverything,
    text,
  }
}
