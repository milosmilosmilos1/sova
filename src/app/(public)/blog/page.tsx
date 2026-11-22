import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

import { PostCard } from '@/components/blog/blog-parts'
import { company } from '@/config/company'
import { HREFLANG, localePath } from '@/i18n/paths'
import { BLOG_CATEGORIES, isBlogCategory, listPosts, readingMinutes } from '@/lib/blog/posts'
import { publicMetadata, siteUrl } from '@/lib/seo'
import { cn } from '@/lib/utils'

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('blog')])
  return publicMetadata({ locale, path: '/blog', title: t('metaTitle'), description: t('metaDescription') })
}

const jsonForScript = (value: unknown) => JSON.stringify(value).replace(/</g, '\\' + 'u003c')

/** Lista članaka bloga (D-186), sa izborom teme (`?tema=`); kanonska adresa je uvek /blog. */
export default async function BlogIndexPage({ searchParams }: PageProps<'/blog'>) {
  const [locale, t, query] = await Promise.all([getLocale(), getTranslations('blog'), searchParams])
  const tema = typeof query.tema === 'string' && isBlogCategory(query.tema) ? query.tema : null
  const all = listPosts(locale)
  const posts = tema ? all.filter((p) => p.category === tema) : all
  const blogPath = localePath(locale, '/blog')
  const base = siteUrl()

  const chip = (active: boolean) =>
    cn(
      'rounded-full border px-4 py-2 text-[14px] transition-[color,background-color,border-color] duration-200',
      active
        ? 'border-l-accent/50 bg-l-accent/12 text-l-text'
        : 'border-l-line/14 text-l-muted hover:border-l-line/28 hover:text-l-text',
    )

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonForScript({
            '@context': 'https://schema.org',
            '@type': 'Blog',
            '@id': `${base}${blogPath}#blog`,
            name: t('title'),
            description: t('metaDescription'),
            url: `${base}${blogPath}`,
            inLanguage: HREFLANG[locale],
            publisher: { '@type': 'Organization', name: company.productName, url: `${base}/` },
            blogPost: all.map((p) => ({
              '@type': 'BlogPosting',
              headline: p.title,
              url: `${base}${localePath(locale, `/blog/${p.id}`)}`,
              datePublished: p.date,
            })),
          }),
        }}
      />
      <div className="mx-auto max-w-[1200px] px-6 pt-14 pb-24 sm:pt-20">
        <header className="max-w-[720px]">
          <h1 className="text-[clamp(36px,5vw,56px)] leading-[1.04] font-semibold tracking-[-0.04em] text-balance text-l-text">
            {t('title')}
          </h1>
          <p className="mt-5 text-[18px] leading-[1.6] text-pretty text-l-muted">{t('intro')}</p>
        </header>

        <nav aria-label={t('all')} className="mt-10 flex flex-wrap gap-2.5">
          <Link href={blogPath as Route} className={chip(!tema)} aria-current={!tema ? 'page' : undefined}>
            {t('all')}
          </Link>
          {BLOG_CATEGORIES.map((c) => (
            <Link
              key={c}
              href={`${blogPath}?tema=${c}` as Route}
              className={chip(tema === c)}
              aria-current={tema === c ? 'page' : undefined}
            >
              {t(`categories.${c}`)}
            </Link>
          ))}
        </nav>
        <p className="mt-5 text-[14px] text-l-dim">{t('count', { count: posts.length })}</p>

        {posts.length ? (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                locale={locale}
                category={t(`categories.${p.category}`)}
                readingTime={t('readingTime', { minutes: readingMinutes(p) })}
              />
            ))}
          </div>
        ) : (
          <p className="mt-8 text-[16px] text-l-muted">{t('empty')}</p>
        )}
      </div>
    </>
  )
}
