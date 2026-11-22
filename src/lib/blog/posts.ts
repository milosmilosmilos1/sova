import data from '@/content/blog/generated/posts.json'
import type { AppLocale } from '@/i18n/config'

import { parseBlocks, type Block } from './markdown'

/**
 * Članci bloga (D-186). Podatke pravi `scripts/blog-build.mjs` iz markdown fajlova u
 * src/content/blog; ovde se samo čitaju. Interna adresa članka je uvek srpski slug (`id`), a
 * engleska verzija ima svoj slug u adresi (paths.ts).
 */
export const BLOG_CATEGORIES = ['strategija', 'sadrzaj', 'mreze', 'ai-i-automatizacija'] as const
export type BlogCategory = (typeof BLOG_CATEGORIES)[number]

export interface BlogPost {
  locale: AppLocale
  /** srpski slug, isti za obe verzije */
  id: string
  /** slug u adresi na jeziku članka */
  slug: string
  title: string
  seoTitle: string
  description: string
  excerpt: string
  category: BlogCategory
  cover: string
  date: string
  updated: string
  /** redosled u listi među člancima istog datuma (`redosled:` u zaglavlju, manji je prvi) */
  order: number
  words: number
  body: string
}

export interface BlogImage {
  width: number
  height: number
  /** infografika ima posebnu verziju na engleskom (`<ključ>-en.webp`) */
  localized?: boolean
  alt: { sr: string; en: string }
  credit?: { name: string; url: string; photo: string }
}

const DATA = data as unknown as { posts: BlogPost[]; images: Record<string, BlogImage> }

export function isBlogCategory(value: unknown): value is BlogCategory {
  return typeof value === 'string' && (BLOG_CATEGORIES as readonly string[]).includes(value)
}

/** Članci na jeziku, najnoviji prvi; isti datum po polju `order`. */
export function listPosts(locale: AppLocale): BlogPost[] {
  return DATA.posts
    .filter((p) => p.locale === locale)
    .sort((a, b) => b.date.localeCompare(a.date) || a.order - b.order || a.id.localeCompare(b.id))
}

/** Članak po internoj adresi (srpski slug). */
export function getPost(locale: AppLocale, id: string): BlogPost | null {
  return DATA.posts.find((p) => p.locale === locale && p.id === id) ?? null
}

export function getImage(key: string): BlogImage | null {
  return DATA.images[key] ?? null
}

/** Putanja fajla slike na jeziku strane. */
export function imageSrc(key: string, locale: AppLocale): string {
  const localized = DATA.images[key]?.localized && locale === 'en'
  return `/blog/${key}${localized ? '-en' : ''}.webp`
}

export function imageAlt(key: string, locale: AppLocale): string {
  const img = DATA.images[key]
  return img ? (locale === 'en' ? img.alt.en : img.alt.sr) : ''
}

/** Minuti čitanja, 200 reči u minutu. */
export function readingMinutes(post: BlogPost): number {
  return Math.max(1, Math.round(post.words / 200))
}

const parsed = new Map<string, Block[]>()
export function postBlocks(post: BlogPost): Block[] {
  const key = `${post.locale}:${post.id}`
  let blocks = parsed.get(key)
  if (!blocks) {
    blocks = parseBlocks(post.body)
    parsed.set(key, blocks)
  }
  return blocks
}

/** Do tri članka iz iste teme, pa najnoviji iz ostalih. */
export function relatedPosts(post: BlogPost, count = 3): BlogPost[] {
  const all = listPosts(post.locale).filter((p) => p.id !== post.id)
  const same = all.filter((p) => p.category === post.category)
  const rest = all.filter((p) => p.category !== post.category)
  return [...same, ...rest].slice(0, count)
}
