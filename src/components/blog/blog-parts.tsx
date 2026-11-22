import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import type { AppLocale } from '@/i18n/config'
import { INTL_UI } from '@/i18n/config'
import { localePath } from '@/i18n/paths'
import { getImage, imageAlt, imageSrc, type BlogPost } from '@/lib/blog/posts'

/** Mesec u genitivu posle dana („22. novembra”); Intl daje nominativ („22. novembar”). */
const SR_GENITIVE: Record<string, string> = {
  januar: 'januara',
  februar: 'februara',
  mart: 'marta',
  april: 'aprila',
  maj: 'maja',
  jun: 'juna',
  jul: 'jula',
  avgust: 'avgusta',
  septembar: 'septembra',
  oktobar: 'oktobra',
  novembar: 'novembra',
  decembar: 'decembra',
}

/** Datum članka na jeziku strane (22. novembra 2026. / 22 November 2026). */
export function formatPostDate(date: string, locale: AppLocale): string {
  const text = new Intl.DateTimeFormat(INTL_UI[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Belgrade',
  }).format(new Date(`${date}T12:00:00Z`))
  return locale === 'sr-Latn' ? text.replace(/\p{L}+/u, (m) => SR_GENITIVE[m] ?? m) : text
}

export const postHref = (post: Pick<BlogPost, 'id'>, locale: AppLocale) =>
  localePath(locale, `/blog/${post.id}`) as Route

/** Kartica članka u listi i u „Pročitajte još”. */
export function PostCard({
  post,
  locale,
  category,
  readingTime,
  headingLevel = 'h2',
}: {
  post: BlogPost
  locale: AppLocale
  category: string
  /** „7 min čitanja”, već preveden */
  readingTime: string
  headingLevel?: 'h2' | 'h3'
}) {
  const img = getImage(post.cover)
  const Heading = headingLevel
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-l-line/10 bg-l-card transition-colors duration-200 hover:border-l-line/22">
      {img ? (
        <div className="relative aspect-[16/9] overflow-hidden bg-l-img">
          <Image
            src={imageSrc(post.cover, locale)}
            alt={imageAlt(post.cover, locale)}
            fill
            sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <p className="font-l-mono text-[11.5px] tracking-[0.1em] text-l-accent-soft uppercase">{category}</p>
        <Heading className="text-[19px] leading-[1.3] font-semibold tracking-[-0.01em] text-balance text-l-text">
          <Link href={postHref(post, locale)} className="after:absolute after:inset-0">
            {post.title}
          </Link>
        </Heading>
        <p className="line-clamp-3 text-[15px] leading-[1.55] text-l-muted">{post.excerpt}</p>
        <p className="mt-auto pt-1 text-[13px] text-l-dim">
          {formatPostDate(post.date, locale)} · {readingTime}
        </p>
      </div>
    </article>
  )
}
