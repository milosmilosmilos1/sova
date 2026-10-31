import type { MetadataRoute } from 'next'

import { company } from '@/config/company'
import { locales } from '@/i18n/config'
import { HREFLANG, localePath } from '@/i18n/paths'
import { isIndexableHost, SITEMAP_PATHS, siteUrl } from '@/lib/seo'

/** Mapa sajta (D-095): samo javne strane i samo na pravom domenu, svaka na sva tri jezika (D-130). */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!isIndexableHost()) return []
  const base = siteUrl()
  const legalUpdated = new Date(`${company.legalUpdatedAt}T00:00:00Z`)
  const url = (path: string) => `${base}${path === '/' ? '/' : path}`
  return SITEMAP_PATHS.flatMap((p) =>
    locales.map((locale) => ({
      url: url(localePath(locale, p.path)),
      priority: p.priority,
      ...(p.legal ? { lastModified: legalUpdated } : {}),
      alternates: {
        languages: Object.fromEntries(locales.map((l) => [HREFLANG[l], url(localePath(l, p.path))])),
      },
    })),
  )
}
