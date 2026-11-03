'use client'

import { useMutation } from '@tanstack/react-query'
import { Download, Images } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import { FieldRow } from '@/components/brand/profile-kit'
import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { HIGHLIGHT_LIMITS, type Highlight } from '@/lib/ai/prompts/profile-highlights'
import type { ProfileKitView } from '@/services/brand-brain/profile-kit'

/**
 * Instagram highlights (D-144): Sova predlaže highlights iz profila brenda, crta naslovne u boji teme i
 * pravi priču od kadrova. Instagram ne dozvoljava aplikacijama da prave highlights, pa ekran daje naslov
 * za kopiranje, naslovnu za preuzimanje i kratko uputstvo za profil.
 */
export function HighlightsCard({
  brandId,
  initial,
  emailVerified,
}: {
  brandId: string
  initial: ProfileKitView
  emailVerified: boolean
}) {
  const t = useTranslations('profileKit.highlights')
  const tk = useTranslations('profileKit')
  const format = useFormatter()
  const [kit, setKit] = useState(initial)
  const base = `/api/brands/${brandId}/profile-kit/highlights`
  const generate = useMutation({
    mutationFn: () =>
      api<{ kit: ProfileKitView; tokensCharged: number }>(base, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
      }),
    onSuccess: (r) => setKit(r.kit),
  })
  const ready = kit.canEdit && kit.hasProfile && emailVerified
  const highlights = kit.highlights ?? []
  // nove naslovne posle svakog pravljenja; pregledač ih inače čuva pet minuta
  const cover = (i: number) => `${base}/${i}/cover?v=${encodeURIComponent(kit.highlightsAt ?? '')}`

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {kit.canEdit ? (
            <Button onClick={() => generate.mutate()} disabled={!ready || generate.isPending}>
              {generate.isPending
                ? t('generating')
                : t(highlights.length ? 'regenerate' : 'generate', { tokens: kit.prices.highlights })}
            </Button>
          ) : null}
          {highlights.length ? (
            <Button variant="outline" nativeButton={false} render={<a href={`${base}/covers`} />}>
              <Download aria-hidden />
              {t('downloadAll')}
            </Button>
          ) : null}
          {kit.highlightsAt ? (
            <span className="text-xs text-muted-foreground">
              {tk('generatedAt', {
                when: format.dateTime(new Date(kit.highlightsAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })}
            </span>
          ) : null}
        </div>
        {!kit.hasProfile ? (
          <p className="text-sm">
            {t('noProfile')}{' '}
            <Link href="/app/brain" className="font-medium text-primary hover:underline">
              {tk('openBrain')}
            </Link>
          </p>
        ) : null}
        {kit.canEdit && !emailVerified ? (
          <p className="text-sm text-muted-foreground">{t('unverified')}</p>
        ) : null}
        <ErrorBox error={generate.error} />
        {highlights.length ? (
          <>
            <ProfilePreview highlights={highlights} cover={cover} />
            <div className="grid gap-4 lg:grid-cols-2">
              {highlights.map((h, i) => (
                <HighlightItem
                  key={`${kit.highlightsAt}-${i}`}
                  brandId={brandId}
                  index={i}
                  highlight={h}
                  coverUrl={cover(i)}
                  showStory={kit.canEdit}
                  canStory={kit.canEdit && emailVerified}
                  hasInstagram={kit.hasInstagram}
                />
              ))}
            </div>
            <HowTo />
          </>
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t('empty')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/** Red krugova kao ispod opisa profila; Instagram iz naslovne uzima kvadrat iz sredine kadra. */
function ProfilePreview({ highlights, cover }: { highlights: Highlight[]; cover: (i: number) => string }) {
  const t = useTranslations('profileKit.highlights')
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground">{t('preview')}</h3>
      <ul className="flex flex-wrap gap-4">
        {highlights.map((h, i) => (
          <li key={i} className="flex w-[4.5rem] flex-col items-center gap-1.5">
            <span className="rounded-full border p-0.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- naslovna iz API-ja, bez optimizacije */}
              <img src={cover(i)} alt="" className="size-16 rounded-full object-cover" />
            </span>
            <span className="w-full truncate text-center text-xs">{h.title}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function HighlightItem({
  brandId,
  index,
  highlight,
  coverUrl,
  showStory,
  canStory,
  hasInstagram,
}: {
  brandId: string
  index: number
  highlight: Highlight
  coverUrl: string
  showStory: boolean
  canStory: boolean
  hasInstagram: boolean
}) {
  const t = useTranslations('profileKit.highlights')
  const story = useMutation({
    mutationFn: () =>
      api<{ postId: string; status: 'in_review' | 'draft'; notes: string[] }>(
        `/api/brands/${brandId}/profile-kit/highlights/${index}/story`,
        { method: 'POST' },
      ),
  })
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- naslovna iz API-ja, bez optimizacije */}
        <img
          src={coverUrl}
          alt={t('coverAlt', { title: highlight.title })}
          width={72}
          height={128}
          loading="lazy"
          className="h-32 w-[4.5rem] shrink-0 rounded-md border object-cover"
        />
        <div className="min-w-0 flex-1 space-y-3">
          <FieldRow
            label={t('name')}
            value={highlight.title}
            count={Array.from(highlight.title).length}
            max={HIGHLIGHT_LIMITS.title}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<a href={`${coverUrl}&download=1`} />}
            >
              <Download aria-hidden />
              {t('downloadCover')}
            </Button>
            {showStory ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => story.mutate()}
                disabled={!canStory || story.isPending}
              >
                <Images aria-hidden />
                {story.isPending ? t('storyPending') : t('story')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          {t('frames', { n: highlight.frames.length })}
        </p>
        <ol className="space-y-1 text-sm">
          {highlight.frames.map((f, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
              <span className="min-w-0 break-words">
                <span className="font-medium">{f.title}</span>
                {f.body ? <span className="text-muted-foreground"> · {f.body}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </div>
      {showStory && !hasInstagram && !story.data ? (
        <p className="text-xs text-muted-foreground">
          {t('noInstagram')}{' '}
          <Link href="/app/accounts" className="font-medium text-primary hover:underline">
            {t('networks')}
          </Link>
        </p>
      ) : null}
      {story.data ? (
        <div role="status" className="space-y-1 rounded-md bg-muted/50 px-3 py-2 text-sm">
          <p>
            {t(story.data.status === 'in_review' ? 'storyReady' : 'storyDraft')}{' '}
            <Link
              href={`/app/posts/${story.data.postId}`}
              className="font-medium text-primary hover:underline"
            >
              {t('openPost')}
            </Link>
          </p>
          {story.data.notes.map((n) => (
            <p key={n} className="text-xs text-muted-foreground">
              {n}
            </p>
          ))}
        </div>
      ) : null}
      <ErrorBox error={story.error} />
    </section>
  )
}

/** Instagram ne dozvoljava aplikacijama da prave highlights, pa ih korisnik dodaje na profilu. */
function HowTo() {
  const t = useTranslations('profileKit.highlights')
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-4 text-sm">
      <h3 className="font-medium">{t('howTitle')}</h3>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>{t('how1')}</li>
        <li>{t('how2')}</li>
        <li>{t('how3')}</li>
      </ol>
    </div>
  )
}
