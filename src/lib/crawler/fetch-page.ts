import { SsrfError } from '@/lib/ssrf'

import { decodeHtml, extractPage } from './extract'
import type { CrawlDeps, ExtractedPage } from './types'

export type PageFailureCode =
  'NOT_HTML' | 'HTTP_ERROR' | 'BLOCKED' | 'TIMEOUT' | 'TOO_LARGE' | 'FETCH_FAILED' | 'CHALLENGE'

export interface PageFailure {
  url: string
  code: PageFailureCode
  status: number | null
  message: string
}

const CHALLENGE_HINT =
  /cf-browser-verification|cf_chl_|just a moment|checking your browser|attention required|captcha|ddos-guard|__cf_chl/i

/** Preuzima i parsira jednu stranicu; greške su podaci, ne izuzeci. */
export async function fetchPage(
  url: string,
  deps: CrawlDeps,
  opts: { timeoutMs: number; maxBytes: number },
): Promise<ExtractedPage | PageFailure> {
  try {
    const res = await deps.fetch(url, { timeoutMs: opts.timeoutMs, maxBytes: opts.maxBytes })
    if (res.status === 403 || res.status === 503) {
      const text = res.body.subarray(0, 20_000).toString('utf8')
      if (CHALLENGE_HINT.test(text))
        return {
          url,
          code: 'CHALLENGE',
          status: res.status,
          message: 'Sajt traži proveru pregledača (Cloudflare ili slična zaštita).',
        }
    }
    if (!res.ok)
      return { url, code: 'HTTP_ERROR', status: res.status, message: `Sajt je vratio HTTP ${res.status}.` }
    if (!res.contentType.includes('text/html') && !res.contentType.includes('application/xhtml')) {
      return { url, code: 'NOT_HTML', status: res.status, message: 'Odgovor nije HTML stranica.' }
    }
    const html = decodeHtml(res.body, res.contentType)
    return extractPage(html, res.url, res.status)
  } catch (error) {
    if (error instanceof SsrfError) {
      const code: PageFailureCode =
        error.code === 'BLOCKED_HOST'
          ? 'BLOCKED'
          : error.code === 'TIMEOUT'
            ? 'TIMEOUT'
            : error.code === 'TOO_LARGE'
              ? 'TOO_LARGE'
              : 'FETCH_FAILED'
      return { url, code, status: null, message: error.message }
    }
    return {
      url,
      code: 'FETCH_FAILED',
      status: null,
      message: error instanceof Error ? error.message : 'Greška pri preuzimanju.',
    }
  }
}

export function isFailure(x: ExtractedPage | PageFailure): x is PageFailure {
  return 'code' in x && !('contentHash' in x)
}
