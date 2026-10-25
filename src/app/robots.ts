import type { MetadataRoute } from 'next'

import { isIndexableHost, ROBOTS_ALLOW, ROBOTS_DISALLOW, siteUrl } from '@/lib/seo'

/** robots.txt (D-095): javne strane da, aplikacija, admin, API i privatni linkovi ne; van pravog domena ništa. */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexableHost()) return { rules: [{ userAgent: '*', disallow: '/' }] }
  return {
    rules: [{ userAgent: '*', allow: ROBOTS_ALLOW, disallow: ROBOTS_DISALLOW }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
