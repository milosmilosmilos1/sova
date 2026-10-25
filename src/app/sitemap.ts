import type { MetadataRoute } from 'next'

import { company } from '@/config/company'
import { isIndexableHost, SITEMAP_PATHS, siteUrl } from '@/lib/seo'

/** Mapa sajta (D-095): samo javne strane i samo na pravom domenu. */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!isIndexableHost()) return []
  const base = siteUrl()
  const legalUpdated = new Date(`${company.legalUpdatedAt}T00:00:00Z`)
  return SITEMAP_PATHS.map((p) => ({
    url: p.path === '/' ? `${base}/` : `${base}${p.path}`,
    priority: p.priority,
    ...(p.legal ? { lastModified: legalUpdated } : {}),
  }))
}
