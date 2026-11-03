'use client'

import { useMutation } from '@tanstack/react-query'
import { FilePlus } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

import { FieldRow } from '@/components/brand/profile-kit'
import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EXTRAS_NETWORK_LIMITS as N, type ProfileExtras } from '@/lib/ai/prompts/profile-extras'
import { cn } from '@/lib/utils'
import type { ProfileKitView } from '@/services/brand-brain/profile-kit'

const chars = (s: string) => Array.from(s).length

/**
 * Dodaci za profile po mreži (D-146): objave za vrh profila, Pinterest table, YouTube plejliste i
 * najava kanala, usluge na Google profilu i pitanja za početak razgovora. Jedno dugme piše sve; svako
 * polje ima dugme za kopiranje, a objava za vrh profila postaje nacrt jednim klikom.
 */
export function ExtrasCard({
  brandId,
  initial,
  emailVerified,
}: {
  brandId: string
  initial: ProfileKitView
  emailVerified: boolean
}) {
  const t = useTranslations('profileKit.extras')
  const tk = useTranslations('profileKit')
  const format = useFormatter()
  const [kit, setKit] = useState(initial)
  const generate = useMutation({
    mutationFn: () =>
      api<{ kit: ProfileKitView; tokensCharged: number }>(`/api/brands/${brandId}/profile-kit/extras`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
      }),
    onSuccess: (r) => setKit(r.kit),
  })
  const ready = kit.canEdit && kit.hasProfile && emailVerified
  const x = kit.extras

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
                : t(x ? 'regenerate' : 'generate', { tokens: kit.prices.extras })}
            </Button>
          ) : null}
          {kit.extrasAt ? (
            <span className="text-xs text-muted-foreground">
              {tk('generatedAt', {
                when: format.dateTime(new Date(kit.extrasAt), { dateStyle: 'medium', timeStyle: 'short' }),
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
        {x ? (
          <Extras
            key={kit.extrasAt}
            brandId={brandId}
            extras={x}
            showDraft={kit.canEdit}
            canDraft={kit.canEdit && emailVerified}
          />
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t('empty')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function Extras({
  brandId,
  extras: x,
  showDraft,
  canDraft,
}: {
  brandId: string
  extras: ProfileExtras
  showDraft: boolean
  canDraft: boolean
}) {
  const t = useTranslations('profileKit.extras')
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title={t('sections.pinned')} hint={t('hints.pinned')} wide>
        <div className="grid gap-3 xl:grid-cols-3">
          {x.pinned_posts.map((p, i) => (
            <PinnedItem
              key={i}
              brandId={brandId}
              index={i}
              post={p}
              showDraft={showDraft}
              canDraft={canDraft}
            />
          ))}
        </div>
      </Section>
      <Section title={t('sections.boards')} hint={t('hints.boards')}>
        {x.pinterest_boards.map((b, i) => (
          <Group key={i}>
            <FieldRow label={t('fields.boardName')} value={b.name} count={chars(b.name)} max={N.boardName} />
            <FieldRow
              label={t('fields.boardDescription')}
              value={b.description}
              count={chars(b.description)}
              max={N.boardDescription}
            />
          </Group>
        ))}
      </Section>
      <Section title={t('sections.services')} hint={t('hints.services')}>
        {x.google_services.map((s, i) => (
          <Group key={i}>
            <FieldRow
              label={t('fields.serviceName')}
              value={s.name}
              count={chars(s.name)}
              max={N.serviceName}
            />
            <FieldRow
              label={t('fields.serviceDescription')}
              value={s.description}
              count={chars(s.description)}
              max={N.serviceDescription}
            />
          </Group>
        ))}
      </Section>
      <Section title={t('sections.playlists')} hint={t('hints.playlists')}>
        {x.youtube_playlists.map((p, i) => (
          <Group key={i}>
            <FieldRow
              label={t('fields.playlistTitle')}
              value={p.title}
              count={chars(p.title)}
              max={N.playlistTitle}
            />
            <FieldRow
              label={t('fields.playlistDescription')}
              value={p.description}
              count={chars(p.description)}
              max={N.playlistDescription}
            />
          </Group>
        ))}
      </Section>
      <Section title={t('sections.trailer')} hint={t('hints.trailer')}>
        <Group>
          <FieldRow label={t('fields.hook')} value={x.youtube_trailer.hook} />
          <FieldRow label={t('fields.script')} value={x.youtube_trailer.script} />
          <FieldRow label={t('fields.cta')} value={x.youtube_trailer.cta} />
        </Group>
      </Section>
      <Section title={t('sections.iceBreakers')} hint={t('hints.iceBreakers')} wide>
        <div className="grid gap-3 md:grid-cols-2">
          {x.ice_breakers.map((q, i) => (
            <Group key={i}>
              <FieldRow
                label={t('fields.question')}
                value={q.question}
                count={chars(q.question)}
                max={N.question}
              />
              <FieldRow label={t('fields.answer')} value={q.answer} />
            </Group>
          ))}
        </div>
      </Section>
    </div>
  )
}

function Section({
  title,
  hint,
  wide,
  children,
}: {
  title: string
  hint: string
  wide?: boolean
  children: ReactNode
}) {
  return (
    <section className={cn('space-y-3 rounded-lg border p-4', wide && 'lg:col-span-2')}>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  )
}

const Group = ({ children }: { children: ReactNode }) => (
  <div className="space-y-2 rounded-md bg-muted/30 p-3">{children}</div>
)

function PinnedItem({
  brandId,
  index,
  post,
  showDraft,
  canDraft,
}: {
  brandId: string
  index: number
  post: ProfileExtras['pinned_posts'][number]
  showDraft: boolean
  canDraft: boolean
}) {
  const t = useTranslations('profileKit.extras')
  const draft = useMutation({
    mutationFn: () =>
      api<{ postId: string }>(`/api/brands/${brandId}/profile-kit/extras/pinned/${index}`, {
        method: 'POST',
      }),
  })
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/30 p-3">
      <h4 className="text-sm font-medium">{post.title}</h4>
      {post.why ? <p className="text-xs text-muted-foreground">{post.why}</p> : null}
      <FieldRow label={t('fields.postText')} value={post.text} />
      {showDraft ? (
        draft.data ? (
          <p role="status" className="text-sm">
            {t('draftReady')}{' '}
            <Link
              href={`/app/posts/${draft.data.postId}`}
              className="font-medium text-primary hover:underline"
            >
              {t('openDraft')}
            </Link>
          </p>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() => draft.mutate()}
            disabled={!canDraft || draft.isPending}
          >
            <FilePlus aria-hidden />
            {draft.isPending ? t('drafting') : t('draft')}
          </Button>
        )
      ) : null}
      <ErrorBox error={draft.error} />
    </div>
  )
}
