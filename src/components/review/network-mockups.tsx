'use client'

import {
  Bookmark,
  ChartNoAxesColumn,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Globe,
  Heart,
  MessageCircle,
  MessageSquare,
  Music2,
  Plus,
  Repeat2,
  Send,
  Share,
  ThumbsDown,
  ThumbsUp,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Fragment, useState, type CSSProperties, type ReactNode } from 'react'

import { readGbpOptions } from '@/config/google-business'
import { pinterestTitle, readPinterestOptions } from '@/config/pinterest'
import type { SocialPlatform } from '@/config/platforms'
import { readYouTubeOptions, youtubeTitle } from '@/config/youtube'
import { CAPTION_RULES, captionParts, clipCaption, feedRatio, placementOf } from '@/lib/posts/preview'
import { cn } from '@/lib/utils'
import { X_TEXT_MAX, xWeightedLength } from '@/lib/x-text'

/**
 * Izgled objave na mreži (D-138): feed, priča i vertikalni video, nacrtani po uzoru na aplikacije na
 * telefonu. Boje mreža su ovde, a tekst se seče i boji po pravilima iz `lib/posts/preview.ts`.
 */
export interface MockTarget {
  platform: SocialPlatform
  /** ime naloga (stranica, kanal, lokacija) */
  name: string
  /** korisničko ime; Instagram, TikTok i X ga pokazuju umesto imena */
  username: string | null
  avatarUrl: string | null
  text: string
  options: Record<string, unknown>
  postTitle: string | null
  /** prvi komentar (Instagram, Facebook, LinkedIn) */
  firstComment: string
}

export interface MockMedia {
  url: string
  video: boolean
  width: number | null
  height: number | null
  /** slika videa koji pregledač još pravi (D-128) */
  poster?: boolean
}

interface Props {
  target: MockTarget
  media: MockMedia[]
}

export function NetworkMockup({ target, media }: Props) {
  const placement = placementOf(target.platform, target.options, media)
  if (placement === 'story') return <Story target={target} media={media} />
  if (placement === 'vertical') return <Vertical target={target} media={media} />
  switch (target.platform) {
    case 'instagram':
      return <InstagramFeed target={target} media={media} />
    case 'facebook':
      return <FacebookFeed target={target} media={media} />
    case 'linkedin':
      return <LinkedInFeed target={target} media={media} />
    case 'x':
      return <XFeed target={target} media={media} />
    case 'pinterest':
      return <PinterestPin target={target} media={media} />
    case 'google_business':
      return <GoogleBusinessPost target={target} media={media} />
    default:
      // TikTok bez medija i YouTube bez videa (objavljuje samo video): vertikalni okvir sa napomenom
      return <Vertical target={target} media={target.platform === 'youtube' ? [] : media} />
  }
}

const handleOf = (target: MockTarget) => target.username?.replace(/^@/, '') || target.name
const MUTED = 'text-zinc-500 dark:text-zinc-400'

function Avatar({
  target,
  size,
  square = false,
  className,
}: {
  target: MockTarget
  size: number
  square?: boolean
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const style: CSSProperties = { width: size, height: size }
  const shape = square ? 'rounded-md' : 'rounded-full'
  if (target.avatarUrl && !broken)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- slika naloga sa mreže
      <img
        src={target.avatarUrl}
        alt=""
        onError={() => setBroken(true)}
        className={cn('shrink-0 object-cover', shape, className)}
        style={style}
      />
    )
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center bg-zinc-300 font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100',
        shape,
        className,
      )}
      style={{ ...style, fontSize: Math.round(size * 0.42) }}
    >
      {[...target.name.trim()][0]?.toUpperCase() ?? '?'}
    </span>
  )
}

/** Tekst sa heštegovima, pominjanjima i linkovima u boji mreže. */
function Rich({ text, accent }: { text: string; accent: string }) {
  return (
    <>
      {captionParts(text).map((p, i) =>
        p.kind === 'text' ? (
          <Fragment key={i}>{p.value}</Fragment>
        ) : (
          <span key={i} className={accent}>
            {p.value}
          </span>
        ),
      )}
    </>
  )
}

/** Opis skraćen gde mreža stavlja „više”; klik ga otvara ceo, kao na mreži. */
function Caption({
  target,
  accent,
  more,
  lead,
  className,
}: {
  target: MockTarget
  accent: string
  more: string
  lead?: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const full = target.text.trim()
  if (!full) return null
  const { shown, cut } = clipCaption(full, CAPTION_RULES[target.platform])
  return (
    <p className={cn('break-words whitespace-pre-line', className)}>
      {lead}
      <Rich text={open || !cut ? full : shown.replace(/[.…]+$/u, '')} accent={accent} />
      {cut && !open ? (
        <>
          {'… '}
          <button type="button" onClick={() => setOpen(true)} className="opacity-70 hover:underline">
            {more}
          </button>
        </>
      ) : null}
    </p>
  )
}

function Shot({ media, className }: { media: MockMedia; className?: string }) {
  if (media.video && !media.poster)
    return (
      <video
        src={media.url}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden
        className={cn('size-full object-cover', className)}
      />
    )
  // eslint-disable-next-line @next/next/no-img-element -- potpisan URL slajda
  return <img src={media.url} alt="" className={cn('size-full object-cover', className)} />
}

function NoMedia({
  dark = false,
  video = false,
  className,
}: {
  dark?: boolean
  /** mreža objavljuje samo video (YouTube) */
  video?: boolean
  className?: string
}) {
  const t = useTranslations('review')
  return (
    <div
      className={cn(
        'grid place-items-center px-8 text-center text-sm',
        dark
          ? 'absolute inset-0 text-white/80'
          : 'aspect-[4/5] bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
        className,
      )}
    >
      {t(video ? 'netPreview.noVideo' : 'netPreview.noMedia')}
    </div>
  )
}

function Nav({
  side,
  onClick,
  className,
}: {
  side: 'prev' | 'next'
  onClick: () => void
  className?: string
}) {
  const t = useTranslations('review')
  const Icon = side === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t(side === 'prev' ? 'preview.prev' : 'preview.next')}
      className={cn(
        'absolute top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-zinc-900 shadow',
        side === 'prev' ? 'left-2' : 'right-2',
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  )
}

function Dots({ count, active, className }: { count: number; active: number; className?: string }) {
  return (
    <div aria-hidden className={cn('flex justify-center gap-1', className)}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cn(
            'size-1.5 rounded-full',
            i === active ? 'bg-sky-500' : 'bg-zinc-300 dark:bg-zinc-600',
          )}
        />
      ))}
    </div>
  )
}

/** Jedna slika ili karusel sa strelicama, brojačem i tačkama (Instagram feed). */
function Slides({ media, ratio }: { media: MockMedia[]; ratio: number }) {
  const [i, setI] = useState(0)
  const many = media.length > 1
  return (
    <div>
      <div className="relative w-full overflow-hidden bg-black" style={{ aspectRatio: ratio }}>
        <Shot media={media[i]!} />
        {many ? (
          <>
            <span className="absolute top-3 right-3 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">
              {i + 1}/{media.length}
            </span>
            {i > 0 ? <Nav side="prev" onClick={() => setI(i - 1)} /> : null}
            {i < media.length - 1 ? <Nav side="next" onClick={() => setI(i + 1)} /> : null}
          </>
        ) : null}
      </div>
      {many ? <Dots count={media.length} active={i} className="pt-2" /> : null}
    </div>
  )
}

/** Više fotografija u mreži kao na Facebooku, LinkedInu i X-u; višak se broji na poslednjoj. */
function Grid({ media, max, className }: { media: MockMedia[]; max: number; className?: string }) {
  const shown = media.slice(0, max)
  const extra = media.length - shown.length
  const n = shown.length
  const layout = n === 2 ? 'grid-cols-2' : n <= 4 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-6 grid-rows-2'
  const cell = (i: number) =>
    n === 3 && i === 0 ? 'row-span-2' : n >= 5 ? (i < 2 ? 'col-span-3' : 'col-span-2') : ''
  return (
    <div className={cn('grid aspect-square gap-0.5 overflow-hidden', layout, className)}>
      {shown.map((m, i) => (
        <div key={i} className={cn('relative overflow-hidden bg-black', cell(i))}>
          <Shot media={m} />
          {extra > 0 && i === n - 1 ? (
            <span className="absolute inset-0 grid place-items-center bg-black/50 text-2xl font-semibold text-white">
              +{extra}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function FeedMedia({
  platform,
  media,
  max,
  className,
}: {
  platform: SocialPlatform
  media: MockMedia[]
  max: number
  className?: string
}) {
  if (!media.length) return null
  if (media.length > 1) return <Grid media={media} max={max} className={className} />
  return (
    <div
      className={cn('relative w-full overflow-hidden bg-black', className)}
      style={{ aspectRatio: feedRatio(platform, media[0]) }}
    >
      <Shot media={media[0]!} />
    </div>
  )
}

function Actions({
  items,
  stacked = false,
  className,
}: {
  items: Array<[LucideIcon, string]>
  stacked?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex justify-around px-2 py-1.5 font-medium text-zinc-600 dark:text-zinc-300',
        stacked ? 'text-[11px]' : 'text-[13px]',
        className,
      )}
    >
      {items.map(([Icon, label]) => (
        <span
          key={label}
          className={cn('flex items-center gap-1.5 px-1 py-1', stacked && 'flex-col gap-0.5')}
        >
          <Icon className="size-[18px]" aria-hidden />
          {label}
        </span>
      ))}
    </div>
  )
}

/** Prvi komentar u oblačiću (Facebook, LinkedIn). */
function CommentBubble({ target, accent }: { target: MockTarget; accent: string }) {
  if (!target.firstComment.trim()) return null
  return (
    <div className="flex gap-2 px-3 pt-1 pb-3">
      <Avatar target={target} size={28} square={target.platform === 'linkedin'} />
      <div className="min-w-0 rounded-2xl bg-zinc-100 px-3 py-2 text-[13px] dark:bg-zinc-800">
        <p className="font-semibold">{target.name}</p>
        <p className="break-words whitespace-pre-line">
          <Rich text={target.firstComment.trim()} accent={accent} />
        </p>
      </div>
    </div>
  )
}

function InstagramFeed({ target, media }: Props) {
  const t = useTranslations('review')
  const handle = handleOf(target)
  const accent = 'text-[#00376b] dark:text-[#e0f1ff]'
  return (
    <div className="bg-white text-[13px] text-zinc-900 dark:bg-black dark:text-zinc-100">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar target={target} size={32} />
        <span className="truncate font-semibold">{handle}</span>
        <Ellipsis className="ml-auto size-5 shrink-0" aria-hidden />
      </div>
      {media.length ? <Slides media={media} ratio={feedRatio('instagram', media[0])} /> : <NoMedia />}
      <div className="flex items-center gap-4 px-3 pt-2.5">
        <Heart className="size-6" aria-hidden />
        <MessageCircle className="size-6 -scale-x-100" aria-hidden />
        <Send className="size-6" aria-hidden />
        <Bookmark className="ml-auto size-6" aria-hidden />
      </div>
      <div className="space-y-1 px-3 pt-2 pb-3">
        <Caption
          target={target}
          accent={accent}
          more={t('netPreview.more')}
          lead={<span className="mr-1 font-semibold">{handle}</span>}
        />
        {target.firstComment.trim() ? (
          <p className="break-words whitespace-pre-line">
            <span className="mr-1 font-semibold">{handle}</span>
            <Rich text={target.firstComment.trim()} accent={accent} />
          </p>
        ) : null}
        <p className={cn('text-[11px]', MUTED)}>{t('netPreview.now')}</p>
      </div>
    </div>
  )
}

/** Priča na Instagramu i Facebooku: preko celog ekrana, bez opisa. */
function Story({ target, media }: Props) {
  const t = useTranslations('review')
  const [i, setI] = useState(0)
  const shot = media[i]
  return (
    <div className="relative aspect-[9/16] w-full overflow-hidden bg-zinc-900 text-white">
      {shot ? <Shot media={shot} /> : <NoMedia dark />}
      <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/50 to-transparent px-2.5 pt-2.5 pb-8">
        <div className="flex gap-1">
          {Array.from({ length: Math.max(1, media.length) }, (_, k) => (
            <span key={k} className={cn('h-0.5 flex-1 rounded-full', k <= i ? 'bg-white' : 'bg-white/40')} />
          ))}
        </div>
        <div className="mt-2.5 flex items-center gap-2 text-[13px]">
          <Avatar target={target} size={32} />
          <span className="truncate font-semibold">{handleOf(target)}</span>
          <span className="shrink-0 text-white/80">{t('netPreview.nowShort')}</span>
          <Ellipsis className="ml-auto size-5 shrink-0" aria-hidden />
          <X className="size-6 shrink-0" aria-hidden />
        </div>
      </div>
      {media.length > 1 ? (
        <>
          {i > 0 ? <Nav side="prev" onClick={() => setI(i - 1)} /> : null}
          {i < media.length - 1 ? <Nav side="next" onClick={() => setI(i + 1)} /> : null}
        </>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 px-3 pb-4">
        <span className="flex-1 rounded-full border border-white/70 px-4 py-2 text-[13px] text-white/90">
          {t('netPreview.reply')}
        </span>
        <Heart className="size-6 shrink-0" aria-hidden />
        <Send className="size-6 shrink-0" aria-hidden />
      </div>
    </div>
  )
}

const RAIL: Partial<Record<SocialPlatform, LucideIcon[]>> = {
  instagram: [Heart, MessageCircle, Send, Ellipsis],
  tiktok: [Heart, MessageCircle, Bookmark, Share],
  youtube: [ThumbsUp, ThumbsDown, MessageSquare, Share, Ellipsis],
}

/** Vertikalni video preko celog ekrana: Reel na Instagramu, TikTok i YouTube Shorts. */
function Vertical({ target, media }: Props) {
  const t = useTranslations('review')
  const [i, setI] = useState(0)
  const p = target.platform
  const handle = handleOf(target)
  const shot = media[i]
  return (
    <div className="relative aspect-[9/16] w-full overflow-hidden bg-zinc-900 text-white">
      {shot ? <Shot media={shot} /> : <NoMedia dark video={p === 'youtube'} />}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/25" />
      {p === 'tiktok' ? (
        <div className="absolute inset-x-0 top-3 flex justify-center gap-4 text-[15px] font-semibold">
          <span className="text-white/75">{t('netPreview.following')}</span>
          <span className="border-b-2 border-white pb-1">{t('netPreview.forYou')}</span>
        </div>
      ) : null}
      {media.length > 1 ? (
        <>
          {i > 0 ? <Nav side="prev" onClick={() => setI(i - 1)} className="top-1/3" /> : null}
          {i < media.length - 1 ? <Nav side="next" onClick={() => setI(i + 1)} className="top-1/3" /> : null}
          <Dots count={media.length} active={i} className="absolute inset-x-0 bottom-2" />
        </>
      ) : null}
      <div className="absolute right-2 bottom-24 flex flex-col items-center gap-5">
        {p === 'tiktok' ? (
          <span className="relative mb-1">
            <Avatar target={target} size={44} className="border-2 border-white" />
            <span className="absolute -bottom-2 left-1/2 grid size-5 -translate-x-1/2 place-items-center rounded-full bg-[#fe2c55]">
              <Plus className="size-3.5" aria-hidden />
            </span>
          </span>
        ) : null}
        {(RAIL[p] ?? RAIL.tiktok!).map((Icon, k) => (
          <Icon key={k} className="size-7 drop-shadow" aria-hidden />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 space-y-2 px-3 pr-16 pb-6 text-[13px] drop-shadow">
        <div className="flex items-center gap-2">
          {p !== 'tiktok' ? <Avatar target={target} size={28} /> : null}
          <span className="truncate font-semibold">{p === 'instagram' ? handle : `@${handle}`}</span>
          {p === 'instagram' ? (
            <span className="shrink-0 rounded-md border border-white/80 px-2 py-0.5 text-xs font-semibold">
              {t('netPreview.follow')}
            </span>
          ) : null}
          {p === 'youtube' ? (
            <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-900">
              {t('netPreview.subscribe')}
            </span>
          ) : null}
        </div>
        {p === 'youtube' ? (
          <p className="line-clamp-2 font-medium">
            {youtubeTitle(readYouTubeOptions(target.options), target.postTitle, target.text)}
          </p>
        ) : (
          <Caption target={target} accent="font-semibold" more={t('netPreview.more')} />
        )}
        {p !== 'youtube' ? (
          <p className="flex items-center gap-1.5 text-xs">
            <Music2 className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {t('netPreview.sound')} · {handle}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  )
}

function FacebookFeed({ target, media }: Props) {
  const t = useTranslations('review')
  const accent = 'text-[#0866ff] dark:text-[#4599ff]'
  return (
    <div className="bg-white text-[14px] text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
      <div className="flex items-center gap-2 px-3 pt-3">
        <Avatar target={target} size={40} />
        <div className="min-w-0">
          <p className="truncate leading-tight font-semibold">{target.name}</p>
          <p className={cn('flex items-center gap-1 text-xs', MUTED)}>
            {t('netPreview.now')} · <Globe className="size-3" aria-hidden />
          </p>
        </div>
        <Ellipsis className={cn('ml-auto size-5 shrink-0', MUTED)} aria-hidden />
      </div>
      <Caption target={target} className="px-3 pt-2" accent={accent} more={t('netPreview.seeMore')} />
      <FeedMedia platform="facebook" media={media} max={5} className="mt-2" />
      <Actions
        items={[
          [ThumbsUp, t('netPreview.like')],
          [MessageCircle, t('netPreview.comment')],
          [Share, t('netPreview.share')],
        ]}
        className="mt-1 border-t border-zinc-200 dark:border-zinc-700"
      />
      <CommentBubble target={target} accent={accent} />
    </div>
  )
}

function LinkedInFeed({ target, media }: Props) {
  const t = useTranslations('review')
  const accent = 'font-semibold text-[#0a66c2] dark:text-[#70b5f9]'
  return (
    <div className="bg-white text-[14px] text-zinc-900 dark:bg-[#1b1f23] dark:text-zinc-100">
      <div className="flex items-start gap-2 px-3 pt-3">
        <Avatar target={target} size={48} square />
        <div className="min-w-0 flex-1">
          <p className="truncate leading-tight font-semibold">{target.name}</p>
          <p className={cn('mt-0.5 flex items-center gap-1 text-xs', MUTED)}>
            {t('netPreview.now')} • <Globe className="size-3" aria-hidden />
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-[#0a66c2] dark:text-[#70b5f9]">
          <Plus className="size-4" aria-hidden />
          {t('netPreview.follow')}
        </span>
      </div>
      <Caption target={target} className="px-3 pt-2" accent={accent} more={t('netPreview.more')} />
      <FeedMedia platform="linkedin" media={media} max={4} className="mt-2" />
      <Actions
        stacked
        items={[
          [ThumbsUp, t('netPreview.like')],
          [MessageSquare, t('netPreview.comment')],
          [Repeat2, t('netPreview.repost')],
          [Send, t('netPreview.send')],
        ]}
        className="mt-1 border-t border-zinc-200 dark:border-zinc-700"
      />
      <CommentBubble target={target} accent={accent} />
    </div>
  )
}

function XFeed({ target, media }: Props) {
  const t = useTranslations('review')
  const text = target.text.trim()
  return (
    <div className="flex gap-3 bg-white px-3 py-3 text-[15px] text-zinc-900 dark:bg-black dark:text-zinc-100">
      <Avatar target={target} size={40} />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="flex min-w-0 items-baseline gap-1 leading-tight">
          <span className="truncate font-bold">{target.name}</span>
          <span className={cn('shrink-0', MUTED)}>
            {target.username ? `@${handleOf(target)} · ` : ''}
            {t('netPreview.nowShort')}
          </span>
        </p>
        {text ? (
          <p className="break-words whitespace-pre-line">
            <Rich text={text} accent="text-sky-700 dark:text-sky-400" />
          </p>
        ) : null}
        {xWeightedLength(text) > X_TEXT_MAX ? (
          <p className="text-xs font-medium text-red-700 dark:text-red-400">
            {t('netPreview.xTooLong', { max: X_TEXT_MAX })}
          </p>
        ) : null}
        <FeedMedia
          platform="x"
          media={media}
          max={4}
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800"
        />
        <div className={cn('flex justify-between pt-1', MUTED)}>
          {[MessageCircle, Repeat2, Heart, ChartNoAxesColumn, Bookmark].map((Icon, k) => (
            <Icon key={k} className="size-[18px]" aria-hidden />
          ))}
        </div>
      </div>
    </div>
  )
}

function PinterestPin({ target, media }: Props) {
  const t = useTranslations('review')
  const m = media[0]
  const title = pinterestTitle(readPinterestOptions(target.options), target.postTitle, target.text)
  return (
    <div className="bg-white p-3 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
      {m ? (
        <div
          className="relative overflow-hidden rounded-3xl bg-black"
          style={{ aspectRatio: feedRatio('pinterest', m) }}
        >
          <Shot media={m} />
          <span className="absolute top-3 right-3 rounded-full bg-[#e60023] px-4 py-2 text-sm font-semibold text-white">
            {t('netPreview.save')}
          </span>
        </div>
      ) : (
        <NoMedia className="rounded-3xl" />
      )}
      <div className="flex items-center gap-2 pt-3">
        <Avatar target={target} size={32} />
        <span className="truncate text-sm font-semibold">{target.name}</span>
        <span className="ml-auto shrink-0 rounded-full bg-zinc-200 px-3 py-1.5 text-sm font-semibold dark:bg-zinc-700">
          {t('netPreview.follow')}
        </span>
      </div>
      {title ? <p className="pt-2 text-lg leading-snug font-semibold">{title}</p> : null}
      <Caption target={target} className="pt-1 text-sm" accent="font-semibold" more={t('netPreview.more')} />
    </div>
  )
}

function GoogleBusinessPost({ target, media }: Props) {
  const t = useTranslations('review')
  const tg = useTranslations('postPanels.gbp')
  const m = media.find((x) => !x.video) ?? media[0]
  const action = readGbpOptions(target.options).actionType
  return (
    <div className="space-y-3 bg-white p-4 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
      <div className="flex items-center gap-3">
        <Avatar target={target} size={40} />
        <div className="min-w-0">
          <p className="truncate font-medium">{target.name}</p>
          <p className={cn('text-xs', MUTED)}>{t('netPreview.now')}</p>
        </div>
      </div>
      {m ? (
        <div
          className="overflow-hidden rounded-lg bg-black"
          style={{ aspectRatio: feedRatio('google_business', m) }}
        >
          <Shot media={m} />
        </div>
      ) : null}
      <Caption
        target={target}
        className="text-sm"
        accent="text-[#1a73e8] dark:text-[#8ab4f8]"
        more={t('netPreview.more')}
      />
      {action !== 'NONE' ? (
        <span className="inline-flex rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-[#1a73e8] dark:border-zinc-600 dark:text-[#8ab4f8]">
          {tg(`actions.${action}`)}
        </span>
      ) : null}
    </div>
  )
}
