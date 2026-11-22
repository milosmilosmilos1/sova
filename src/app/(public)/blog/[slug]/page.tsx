import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'

import { ArticleBody, BlogFigure } from '@/components/blog/article-body'
import { formatPostDate, PostCard } from '@/components/blog/blog-parts'
import { company } from '@/config/company'
import type { AppLocale } from '@/i18n/config'
import { HREFLANG, localePath, SECTION_IDS } from '@/i18n/paths'
import { faqFrom, type Block } from '@/lib/blog/markdown'
import { getPost, imageSrc, postBlocks, readingMinutes, relatedPosts, type BlogPost } from '@/lib/blog/posts'
import { isFeatureEnabled } from '@/lib/flags'
import { publicMetadata, siteUrl } from '@/lib/seo'

/** Naslov odeljka sa pitanjima u tekstu članka; iz njega nastaje FAQPage. */
const FAQ_HEADING: Record<AppLocale, string> = {
  'sr-Latn': 'Česta pitanja',
  en: 'Frequently asked questions',
}

async function load(params: Promise<{ slug: string }>) {
  const [{ slug }, locale] = await Promise.all([params, getLocale()])
  return { locale, post: getPost(locale, slug) }
}

export async function generateMetadata({ params }: PageProps<'/blog/[slug]'>): Promise<Metadata> {
  const { locale, post } = await load(params)
  if (!post) return {}
  const base = publicMetadata({
    locale,
    path: `/blog/${post.id}`,
    title: post.seoTitle,
    description: post.description,
  })
  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: 'article',
      publishedTime: post.date,
      modifiedTime: post.updated,
      // JPG 1200x630 od naslovne (seo/blog/sovaai.rs/prenesi.py): LinkedIn i neki servisi ne čitaju WebP
      images: [{ url: ogImage(post), width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title: post.seoTitle, description: post.description },
  }
}

const ogImage = (post: BlogPost) => `/blog/og/${post.cover}.jpg`

/** JSON u `<script>`: `<` kao escape, da tekst ne može da zatvori tag. */
const jsonForScript = (value: unknown) => JSON.stringify(value).replace(/</g, '\\' + 'u003c')

function structuredData(
  post: BlogPost,
  blocks: Block[],
  locale: AppLocale,
  labels: { home: string; blog: string },
) {
  const base = siteUrl()
  const url = `${base}${localePath(locale, `/blog/${post.id}`)}`
  const faq = faqFrom(blocks, FAQ_HEADING[locale])
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': `${url}#article`,
        headline: post.title,
        description: post.description,
        image: [`${base}${ogImage(post)}`, `${base}${imageSrc(post.cover, locale)}`],
        datePublished: post.date,
        dateModified: post.updated,
        inLanguage: HREFLANG[locale],
        wordCount: post.words,
        mainEntityOfPage: url,
        author: { '@type': 'Organization', name: company.productName, url: `${base}/` },
        publisher: { '@id': `${base}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: labels.home, item: `${base}${localePath(locale, '/')}` },
          {
            '@type': 'ListItem',
            position: 2,
            name: labels.blog,
            item: `${base}${localePath(locale, '/blog')}`,
          },
          { '@type': 'ListItem', position: 3, name: post.title, item: url },
        ],
      },
      ...(faq.length
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: faq.map((f) => ({
                '@type': 'Question',
                name: f.q,
                acceptedAnswer: { '@type': 'Answer', text: f.a },
              })),
            },
          ]
        : []),
    ],
  }
}

/** Članak bloga (D-186). Interna adresa je srpski slug; engleska verzija ima svoj slug u adresi. */
export default async function BlogPostPage({ params }: PageProps<'/blog/[slug]'>) {
  const { locale, post } = await load(params)
  if (!post) notFound()
  const [t, nav, registrationOpen] = await Promise.all([
    getTranslations('blog'),
    getTranslations('nav'),
    isFeatureEnabled('registration_open'),
  ])
  const blocks = postBlocks(post)
  const toc = blocks.filter((b): b is Extract<Block, { type: 'h2' }> => b.type === 'h2')
  const related = relatedPosts(post)
  const href = (path: string) => localePath(locale, path) as Route
  const cta = registrationOpen ? href('/register') : href(`/#${SECTION_IDS[locale].pricing}`)
  const updated = post.updated !== post.date

  const tocList = (
    <ol className="space-y-1.5 text-[14.5px] leading-[1.45]">
      {toc.map((h) => (
        <li key={h.id}>
          <a href={`#${h.id}`} className="text-l-muted transition-colors hover:text-l-text">
            {h.text}
          </a>
        </li>
      ))}
    </ol>
  )

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonForScript(structuredData(post, blocks, locale, { home: t('home'), blog: nav('blog') })),
        }}
      />
      <div className="mx-auto max-w-[1160px] px-6 pt-10 pb-24 sm:pt-14">
        <nav aria-label={t('breadcrumb')} className="mb-8 text-[13.5px] text-l-dim">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <li>
              <Link href={href('/')} className="transition-colors hover:text-l-text">
                {t('home')}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href={href('/blog')} className="transition-colors hover:text-l-text">
                {nav('blog')}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href={`${href('/blog')}?tema=${post.category}` as Route}
                className="transition-colors hover:text-l-text"
              >
                {t(`categories.${post.category}`)}
              </Link>
            </li>
          </ol>
        </nav>

        <div className="lg:grid lg:grid-cols-[minmax(0,760px)_minmax(0,1fr)] lg:gap-16">
          <article className="min-w-0">
            <header>
              <h1 className="text-[clamp(32px,4.6vw,48px)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance text-l-text">
                {post.title}
              </h1>
              <p className="mt-5 text-[19px] leading-[1.55] text-pretty text-l-muted">{post.excerpt}</p>
              <p className="mt-5 flex flex-wrap gap-x-3 gap-y-1 text-[14px] text-l-dim">
                <span>{t('published', { date: formatPostDate(post.date, locale) })}</span>
                {updated ? (
                  <span>· {t('updated', { date: formatPostDate(post.updated, locale) })}</span>
                ) : null}
                <span>· {t('readingTime', { minutes: readingMinutes(post) })}</span>
              </p>
            </header>

            <BlogFigure
              imageKey={post.cover}
              locale={locale}
              photoLabel={t('photo')}
              priority
              className="mt-9 mb-8"
            />

            <details className="mb-6 rounded-xl border border-l-line/12 bg-l-card/60 px-5 py-4 lg:hidden">
              <summary className="cursor-pointer text-[15px] font-semibold text-l-text">{t('toc')}</summary>
              <div className="mt-3">{tocList}</div>
            </details>

            <ArticleBody
              blocks={blocks}
              locale={locale}
              labels={{ summary: t('summary'), photo: t('photo') }}
            />

            <aside className="mt-16 rounded-2xl border border-l-accent/25 bg-l-card bg-[radial-gradient(600px_240px_at_50%_0%,rgb(61_169_252/0.14),transparent_70%)] px-7 py-8 text-center">
              <p className="text-[clamp(22px,3vw,28px)] leading-[1.2] font-semibold tracking-[-0.02em] text-l-text">
                {t('cta.title')}
              </p>
              <p className="mx-auto mt-3 max-w-[520px] text-[16px] leading-[1.55] text-l-muted">
                {t('cta.text')}
              </p>
              <Link
                href={cta}
                className="mt-6 inline-flex rounded-[10px] bg-l-accent px-5 py-3 text-[15px] font-semibold text-l-on-accent transition-[background-color] duration-200 hover:bg-l-accent-hover"
              >
                {registrationOpen ? t('cta.button') : t('cta.closed')}
              </Link>
            </aside>
          </article>

          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <p className="mb-3 font-l-mono text-[12px] font-semibold tracking-[0.12em] text-l-dim uppercase">
                {t('toc')}
              </p>
              <nav aria-label={t('toc')}>{tocList}</nav>
            </div>
          </aside>
        </div>

        {related.length ? (
          <section className="mt-20 border-t border-l-line/10 pt-12">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <h2 className="text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.025em] text-l-text">
                {t('related')}
              </h2>
              <Link href={href('/blog')} className="text-[15px] text-l-accent-soft hover:text-l-accent-pale">
                {t('back')}
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  locale={locale}
                  category={t(`categories.${p.category}`)}
                  readingTime={t('readingTime', { minutes: readingMinutes(p) })}
                  headingLevel="h3"
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  )
}
