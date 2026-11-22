import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'

import type { AppLocale } from '@/i18n/config'
import { localePath, SECTION_IDS, type SectionKey } from '@/i18n/paths'
import type { Block, Inline } from '@/lib/blog/markdown'
import { getImage, imageAlt, imageSrc } from '@/lib/blog/posts'

const linkClass =
  'text-l-accent-soft underline decoration-l-accent-soft/40 underline-offset-2 transition-colors hover:decoration-current'

/** Unsplash traži link na autora i na Unsplash sa oznakom izvora. */
const unsplashRef = (url: string) =>
  `${url}${url.includes('?') ? '&' : '?'}utm_source=sova&utm_medium=referral`

/** Adresa iz teksta članka na jeziku strane: `@slug` je članak, `/#pricing` sekcija početne. */
export function resolveHref(href: string, locale: AppLocale): { href: string; internal: boolean } {
  if (href.startsWith('@')) return { href: localePath(locale, `/blog/${href.slice(1)}`), internal: true }
  if (href.startsWith('/')) {
    const [path = '/', hash] = href.split('#')
    const section = hash ? SECTION_IDS[locale][hash as SectionKey] : undefined
    return { href: localePath(locale, section ? `${path}#${section}` : path), internal: true }
  }
  return { href, internal: false }
}

export function InlineText({ nodes, locale }: { nodes: Inline[]; locale: AppLocale }): ReactNode {
  return nodes.map((n, i) => {
    if (n.type === 'text') return n.text
    if (n.type === 'strong')
      return (
        <strong key={i} className="font-semibold text-l-text">
          <InlineText nodes={n.children} locale={locale} />
        </strong>
      )
    const target = resolveHref(n.href, locale)
    return target.internal ? (
      <Link key={i} href={target.href as Route} className={linkClass}>
        <InlineText nodes={n.children} locale={locale} />
      </Link>
    ) : (
      <a key={i} href={target.href} target="_blank" rel="noopener" className={linkClass}>
        <InlineText nodes={n.children} locale={locale} />
      </a>
    )
  })
}

export function BlogFigure({
  imageKey,
  locale,
  photoLabel,
  priority,
  className,
}: {
  imageKey: string
  locale: AppLocale
  photoLabel: string
  priority?: boolean
  className?: string
}) {
  const img = getImage(imageKey)
  if (!img) return null
  return (
    <figure className={className ?? 'my-9'}>
      <Image
        src={imageSrc(imageKey, locale)}
        alt={imageAlt(imageKey, locale)}
        width={img.width}
        height={img.height}
        sizes="(min-width: 800px) 760px, 100vw"
        priority={priority}
        className="h-auto w-full rounded-2xl border border-l-line/10 bg-l-img"
      />
      {img.credit ? (
        <figcaption className="mt-2.5 text-[13px] text-l-dim">
          {photoLabel}:{' '}
          <a href={unsplashRef(img.credit.url)} target="_blank" rel="noopener" className="hover:text-l-muted">
            {img.credit.name}
          </a>
          ,{' '}
          <a
            href={unsplashRef(img.credit.photo)}
            target="_blank"
            rel="noopener"
            className="hover:text-l-muted"
          >
            Unsplash
          </a>
        </figcaption>
      ) : null}
    </figure>
  )
}

/** Tekst članka iz blokova (D-186). Naslovi imaju sidra za sadržaj, tabele se pomeraju vodoravno. */
export function ArticleBody({
  blocks,
  locale,
  labels,
}: {
  blocks: Block[]
  locale: AppLocale
  labels: { summary: string; photo: string }
}) {
  return (
    <div className="text-[17px] leading-[1.75] text-l-text-2">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h2':
            return (
              <h2
                key={i}
                id={b.id}
                className="mt-14 mb-4 scroll-mt-24 text-[clamp(24px,3vw,30px)] leading-[1.2] font-semibold tracking-[-0.02em] text-balance text-l-text"
              >
                <InlineText nodes={b.children} locale={locale} />
              </h2>
            )
          case 'h3':
            return (
              <h3
                key={i}
                id={b.id}
                className="mt-9 mb-3 scroll-mt-24 text-[20px] leading-[1.3] font-semibold tracking-[-0.01em] text-l-text"
              >
                <InlineText nodes={b.children} locale={locale} />
              </h3>
            )
          case 'p':
            return (
              <p key={i} className="my-5 text-pretty">
                <InlineText nodes={b.children} locale={locale} />
              </p>
            )
          case 'ul':
          case 'ol': {
            const List = b.type === 'ul' ? 'ul' : 'ol'
            return (
              <List
                key={i}
                className={`my-5 space-y-2 pl-6 marker:text-l-accent ${b.type === 'ul' ? 'list-disc' : 'list-decimal'}`}
              >
                {b.items.map((item, j) => (
                  <li key={j} className="pl-1">
                    <InlineText nodes={item} locale={locale} />
                  </li>
                ))}
              </List>
            )
          }
          case 'summary':
            return (
              <aside
                key={i}
                className="my-8 rounded-2xl border border-l-accent/25 bg-l-accent/[0.06] px-6 py-5"
              >
                <p className="mb-2 font-l-mono text-[12px] font-semibold tracking-[0.12em] text-l-accent-soft uppercase">
                  {labels.summary}
                </p>
                <ul className="space-y-2 pl-5 text-[16px] leading-[1.6] marker:text-l-accent">
                  {b.items.map((item, j) => (
                    <li key={j} className="list-disc pl-1">
                      <InlineText nodes={item} locale={locale} />
                    </li>
                  ))}
                </ul>
              </aside>
            )
          case 'quote':
            return (
              <blockquote
                key={i}
                className="my-7 border-l-2 border-l-accent/60 pl-5 text-[17px] text-l-text italic"
              >
                <InlineText nodes={b.children} locale={locale} />
              </blockquote>
            )
          case 'table':
            return (
              <div key={i} className="my-8 overflow-x-auto rounded-xl border border-l-line/12">
                <table className="w-full min-w-[520px] border-collapse text-left text-[15px] leading-[1.5]">
                  <thead className="bg-l-raised/70 text-l-text">
                    <tr>
                      {b.head.map((cell, j) => (
                        <th key={j} scope="col" className="px-4 py-3 font-semibold">
                          <InlineText nodes={cell} locale={locale} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, j) => (
                      <tr key={j} className="border-t border-l-line/10 odd:bg-l-card/40">
                        {row.map((cell, k) => (
                          <td key={k} className="px-4 py-3 align-top">
                            <InlineText nodes={cell} locale={locale} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'image':
            return <BlogFigure key={i} imageKey={b.key} locale={locale} photoLabel={labels.photo} />
        }
      })}
    </div>
  )
}
