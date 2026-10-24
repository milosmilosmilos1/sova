import type { SafeFetchFn } from '@/lib/ssrf'
import type { Database } from '@/types/database'

export type PageType = Database['public']['Enums']['page_type']

export const USER_AGENT = `SovaBot/1.0 (+${process.env.BOT_INFO_URL ?? 'https://sovaai.rs/bot'})`

export interface CrawlLimits {
  /** najviše stranica po analizi (zavisi od plana) */
  maxPages: number
  /** paralelnih zahteva */
  concurrency: number
  /** timeout po stranici */
  pageTimeoutMs: number
  /** ukupno trajanje */
  totalTimeoutMs: number
  /** najveći HTML */
  maxHtmlBytes: number
}

export const DEFAULT_LIMITS: CrawlLimits = {
  maxPages: 60,
  concurrency: 3,
  pageTimeoutMs: 10_000,
  totalTimeoutMs: 5 * 60_000,
  maxHtmlBytes: 3 * 1024 * 1024,
}

/** Zavisnosti koje testovi zamenjuju (fetch kroz MSW, DNS stub). */
export interface CrawlDeps {
  fetch: SafeFetchFn
  now?: () => number
}

export interface DiscoveredUrl {
  url: string
  type: PageType
  source: 'seed' | 'sitemap' | 'feed' | 'link'
  priority: number
  lastmod: string | null
}

export interface FeedItem {
  url: string
  title: string | null
  publishedAt: string | null
  summary: string | null
}

export interface ImageRef {
  src: string
  alt: string
  width: number | null
  height: number | null
}

export interface LogoCandidate {
  src: string
  alt: string
  score: number
  reason: string
}

export interface IconLink {
  href: string
  rel: string
  sizes: string | null
}

export interface ExtractedPage {
  url: string
  canonicalUrl: string | null
  type: PageType
  title: string | null
  metaDescription: string | null
  lang: string | null
  headings: { h1: string[]; h2: string[]; h3: string[] }
  text: string
  wordCount: number
  images: ImageRef[]
  jsonLd: unknown[]
  openGraph: Record<string, string>
  socialLinks: Record<string, string>
  stylesheets: string[]
  inlineCss: string
  themeColor: string | null
  iconLinks: IconLink[]
  logoCandidates: LogoCandidate[]
  internalLinks: string[]
  feedLinks: string[]
  publishedAt: string | null
  contentHash: string
  httpStatus: number
  isSpaShell: boolean
}
