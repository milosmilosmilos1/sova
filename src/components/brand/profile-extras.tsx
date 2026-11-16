'use client'

import { useMutation } from '@tanstack/react-query'
import { FilePlus, Pencil } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

import { FieldRow } from '@/components/brand/profile-kit'
import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  EXTRAS_EDIT_LIMITS as E,
  EXTRAS_NETWORK_LIMITS as N,
  type ProfileExtras,
} from '@/lib/ai/prompts/profile-extras'
import { cn } from '@/lib/utils'
import type { ProfileKitView } from '@/services/brand-brain/profile-kit'

const chars = (s: string) => Array.from(s).length

/**
 * Dodaci za profile po mreži (D-146): objave za vrh profila, Pinterest table, YouTube plejliste i
 * najava kanala, usluge na Google profilu i pitanja za početak razgovora. Jedno dugme piše sve; svako
 * polje ima dugme za kopiranje, svaka stavka se menja ručno (D-166), a objava za vrh profila postaje
 * nacrt jednim klikom.
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
            canEdit={kit.canEdit}
            onSaved={setKit}
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

interface EditField {
  key: string
  label: string
  value: string
  max: number
  /** brojač u granici mreže i u prikazu, ne samo u izmeni */
  counted?: boolean
  multiline?: boolean
}

function Extras({
  brandId,
  extras: x,
  showDraft,
  canDraft,
  canEdit,
  onSaved,
}: {
  brandId: string
  extras: ProfileExtras
  showDraft: boolean
  canDraft: boolean
  canEdit: boolean
  onSaved: (kit: ProfileKitView) => void
}) {
  const t = useTranslations('profileKit.extras')
  const save = useMutation({
    mutationFn: (next: ProfileExtras) =>
      api<ProfileKitView>(`/api/brands/${brandId}/profile-kit/extras`, {
        method: 'PATCH',
        json: { extras: next },
      }),
    onSuccess: onSaved,
  })
  // jedna stavka se menja, ostatak dodataka ide kakav jeste
  const saveWith = (change: (draft: ProfileExtras) => ProfileExtras) =>
    save.mutateAsync(change(structuredClone(x))).then(
      () => true,
      () => false,
    )
  const edit = { canEdit, busy: save.isPending, error: save.error, onReset: () => save.reset() }
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
              edit={edit}
              onSave={(v) =>
                saveWith((d) => {
                  d.pinned_posts[i] = { title: v.title!, why: v.why!, text: v.text! }
                  return d
                })
              }
            />
          ))}
        </div>
      </Section>
      <Section title={t('sections.boards')} hint={t('hints.boards')}>
        {x.pinterest_boards.map((b, i) => (
          <EditableGroup
            key={i}
            {...edit}
            fields={[
              { key: 'name', label: t('fields.boardName'), value: b.name, max: N.boardName, counted: true },
              {
                key: 'description',
                label: t('fields.boardDescription'),
                value: b.description,
                max: N.boardDescription,
                counted: true,
                multiline: true,
              },
            ]}
            onSave={(v) =>
              saveWith((d) => {
                d.pinterest_boards[i] = { name: v.name!, description: v.description! }
                return d
              })
            }
          />
        ))}
      </Section>
      <Section title={t('sections.services')} hint={t('hints.services')}>
        {x.google_services.map((s, i) => (
          <EditableGroup
            key={i}
            {...edit}
            fields={[
              {
                key: 'name',
                label: t('fields.serviceName'),
                value: s.name,
                max: N.serviceName,
                counted: true,
              },
              {
                key: 'description',
                label: t('fields.serviceDescription'),
                value: s.description,
                max: N.serviceDescription,
                counted: true,
                multiline: true,
              },
            ]}
            onSave={(v) =>
              saveWith((d) => {
                d.google_services[i] = { name: v.name!, description: v.description! }
                return d
              })
            }
          />
        ))}
      </Section>
      <Section title={t('sections.playlists')} hint={t('hints.playlists')}>
        {x.youtube_playlists.map((p, i) => (
          <EditableGroup
            key={i}
            {...edit}
            fields={[
              {
                key: 'title',
                label: t('fields.playlistTitle'),
                value: p.title,
                max: N.playlistTitle,
                counted: true,
              },
              {
                key: 'description',
                label: t('fields.playlistDescription'),
                value: p.description,
                max: N.playlistDescription,
                counted: true,
                multiline: true,
              },
            ]}
            onSave={(v) =>
              saveWith((d) => {
                d.youtube_playlists[i] = { title: v.title!, description: v.description! }
                return d
              })
            }
          />
        ))}
      </Section>
      <Section title={t('sections.trailer')} hint={t('hints.trailer')}>
        <EditableGroup
          {...edit}
          fields={[
            { key: 'hook', label: t('fields.hook'), value: x.youtube_trailer.hook, max: E.trailerHook },
            {
              key: 'script',
              label: t('fields.script'),
              value: x.youtube_trailer.script,
              max: E.trailerScript,
              multiline: true,
            },
            { key: 'cta', label: t('fields.cta'), value: x.youtube_trailer.cta, max: E.trailerCta },
          ]}
          onSave={(v) =>
            saveWith((d) => {
              d.youtube_trailer = { hook: v.hook!, script: v.script!, cta: v.cta! }
              return d
            })
          }
        />
      </Section>
      <Section title={t('sections.iceBreakers')} hint={t('hints.iceBreakers')} wide>
        <div className="grid gap-3 md:grid-cols-2">
          {x.ice_breakers.map((q, i) => (
            <EditableGroup
              key={i}
              {...edit}
              fields={[
                {
                  key: 'question',
                  label: t('fields.question'),
                  value: q.question,
                  max: N.question,
                  counted: true,
                },
                { key: 'answer', label: t('fields.answer'), value: q.answer, max: E.answer, multiline: true },
              ]}
              onSave={(v) =>
                saveWith((d) => {
                  d.ice_breakers[i] = { question: v.question!, answer: v.answer! }
                  return d
                })
              }
            />
          ))}
        </div>
      </Section>
    </div>
  )
}

interface EditState {
  canEdit: boolean
  busy: boolean
  error: unknown
  onReset: () => void
}

/** Stavka dodataka: polja sa dugmetom za kopiranje, a u izmeni ista polja kao tekst sa brojačem. */
function EditableGroup({
  fields,
  canEdit,
  busy,
  error,
  onReset,
  onSave,
}: EditState & {
  fields: EditField[]
  onSave: (values: Record<string, string>) => Promise<boolean>
}) {
  const ta = useTranslations('profileKit.actions')
  const [editing, setEditing] = useState(false)
  return (
    <Group>
      {editing ? (
        <FieldsForm
          fields={fields}
          busy={busy}
          error={error}
          onCancel={() => {
            onReset()
            setEditing(false)
          }}
          onSave={async (values) => {
            if (await onSave(values)) setEditing(false)
          }}
        />
      ) : (
        <>
          {fields.map((f) => (
            <FieldRow
              key={f.key}
              label={f.label}
              value={f.value}
              {...(f.counted ? { count: chars(f.value), max: f.max } : {})}
            />
          ))}
          {canEdit ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                onReset()
                setEditing(true)
              }}
            >
              <Pencil aria-hidden />
              {ta('edit')}
            </Button>
          ) : null}
        </>
      )}
    </Group>
  )
}

function FieldsForm({
  fields,
  busy,
  error,
  onSave,
  onCancel,
}: {
  fields: EditField[]
  busy: boolean
  error: unknown
  onSave: (values: Record<string, string>) => void
  onCancel: () => void
}) {
  const t = useTranslations('profileKit')
  const ta = useTranslations('profileKit.actions')
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.key, f.value])))
  const over = fields.some((f) => chars(values[f.key] ?? '') > f.max)
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(values)
      }}
    >
      {fields.map((f, i) => {
        const id = `extra-${f.key}-${i}`
        const count = chars(values[f.key] ?? '')
        const set = (value: string) => setValues((v) => ({ ...v, [f.key]: value }))
        return (
          <div key={f.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={id} className="text-xs">
                {f.label}
              </Label>
              <span
                className={cn(
                  'text-xs whitespace-nowrap tabular-nums',
                  count > f.max ? 'font-medium text-destructive' : 'text-muted-foreground',
                )}
              >
                {t('count', { n: count, max: f.max })}
              </span>
            </div>
            {f.multiline ? (
              <Textarea
                id={id}
                value={values[f.key]}
                onChange={(e) => set(e.target.value)}
                rows={4}
                aria-invalid={count > f.max}
              />
            ) : (
              <Input
                id={id}
                value={values[f.key]}
                onChange={(e) => set(e.target.value)}
                aria-invalid={count > f.max}
              />
            )}
          </div>
        )
      })}
      {over ? <p className="text-xs text-destructive">{ta('overLimit')}</p> : null}
      <ErrorBox error={error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || over}>
          {busy ? ta('saving') : ta('save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {ta('cancel')}
        </Button>
      </div>
    </form>
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
  edit,
  onSave,
}: {
  brandId: string
  index: number
  post: ProfileExtras['pinned_posts'][number]
  showDraft: boolean
  canDraft: boolean
  edit: EditState
  onSave: (values: Record<string, string>) => Promise<boolean>
}) {
  const t = useTranslations('profileKit.extras')
  const ta = useTranslations('profileKit.actions')
  const [editing, setEditing] = useState(false)
  const draft = useMutation({
    mutationFn: () =>
      api<{ postId: string }>(`/api/brands/${brandId}/profile-kit/extras/pinned/${index}`, {
        method: 'POST',
      }),
  })
  if (editing)
    return (
      <div className="rounded-md bg-muted/30 p-3">
        <FieldsForm
          fields={[
            { key: 'title', label: t('fields.pinnedTitle'), value: post.title, max: E.pinnedTitle },
            { key: 'why', label: t('fields.pinnedWhy'), value: post.why, max: E.pinnedWhy },
            {
              key: 'text',
              label: t('fields.postText'),
              value: post.text,
              max: E.pinnedText,
              multiline: true,
            },
          ]}
          busy={edit.busy}
          error={edit.error}
          onCancel={() => {
            edit.onReset()
            setEditing(false)
          }}
          onSave={async (values) => {
            if (await onSave(values)) setEditing(false)
          }}
        />
      </div>
    )
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/30 p-3">
      <h4 className="text-sm font-medium">{post.title}</h4>
      {post.why ? <p className="text-xs text-muted-foreground">{post.why}</p> : null}
      <FieldRow label={t('fields.postText')} value={post.text} />
      {edit.canEdit ? (
        <Button
          size="xs"
          variant="ghost"
          className="self-start"
          onClick={() => {
            edit.onReset()
            setEditing(true)
          }}
        >
          <Pencil aria-hidden />
          {ta('edit')}
        </Button>
      ) : null}
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
