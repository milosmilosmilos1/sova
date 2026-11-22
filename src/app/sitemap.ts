import type { MetadataRoute } from 'next'

import { company } from '@/config/company'
import { locales } from '@/i18n/config'
import { HREFLANG, localePath } from '@/i18n/paths'
import { listPosts } from '@/lib/blog/posts'
import { isIndexableHost, SITEMAP_PATHS, siteUrl } from '@/lib/seo'

/**
 * Mapa sajta (D-095): samo javne strane i samo na pravom domenu, svaka na svim jezicima (D-130).
 * Članci bloga (D-186) imaju datum poslednje izmene; svaki ima obe verzije (proverava blog-build).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!isIndexableHost()) return []
  const base = siteUrl()
  const legalUpdated = new Date(`${company.legalUpdatedAt}T00:00:00Z`)
  const url = (path: string) => `${base}${path === '/' ? '/' : path}`
  const alternates = (path: string) => ({
    languages: Object.fromEntries(locales.map((l) => [HREFLANG[l], url(localePath(l, path))])),
  })
  const pages = SITEMAP_PATHS.flatMap((p) =>
    locales.map((locale) => ({
      url: url(localePath(locale, p.path)),
      priority: p.priority,
      ...(p.legal ? { lastModified: legalUpdated } : {}),
      alternates: alternates(p.path),
    })),
  )
  const posts = locales.flatMap((locale) =>
    listPosts(locale).map((post) => {
      const path = `/blog/${post.id}`
      return {
        url: url(localePath(locale, path)),
        priority: 0.6,
        lastModified: new Date(`${post.updated}T00:00:00Z`),
        alternates: alternates(path),
      }
    }),
  )
  return [...pages, ...posts]
}
