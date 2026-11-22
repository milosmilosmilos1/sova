'use client'

import { useMutation } from '@tanstack/react-query'
import { Check, Copy, ExternalLink, Globe, Pencil, Upload } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { NetworkName } from '@/components/shared/network-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { SocialPlatform } from '@/config/platforms'
import {
  PROFILE_FIELDS,
  PROFILE_PLATFORMS,
  WEBSITE_FIELD,
  type ProfileEntry,
  type ProfileField,
} from '@/lib/ai/prompts/profile-bios'
import { cn } from '@/lib/utils'
import type { ProfileKitView } from '@/services/brand-brain/profile-kit'

const ORDER: ProfileField[] = ['name', 'short', 'long', 'keywords']
const chars = (s: string) => Array.from(s).length

/**
 * Opisi profila po mreži (D-143): jedno dugme piše opise za svih sedam mreža, a svako polje ima brojač
 * znakova u granici mreže i dugme za kopiranje. Opis se menja ručno (D-166); na Google poslovni profil
 * Sova ga upisuje sama, a za mreže koje to ne dozvoljavaju kopira tekst i otvara stranu za izmenu.
 */
export function ProfileKitCard({
  brandId,
  initial,
  emailVerified,
}: {
  brandId: string
  initial: ProfileKitView
  emailVerified: boolean
}) {
  const t = useTranslations('profileKit')
  const format = useFormatter()
  const [kit, setKit] = useState(initial)
  const generate = useMutation({
    mutationFn: () =>
      api<{ kit: ProfileKitView; tokensCharged: number }>(`/api/brands/${brandId}/profile-kit/bios`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
      }),
    onSuccess: (r) => setKit(r.kit),
  })
  const ready = kit.canEdit && kit.hasProfile && emailVerified

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
                : t(kit.bios ? 'regenerate' : 'generate', { tokens: kit.prices.bios })}
            </Button>
          ) : null}
          {kit.biosAt ? (
            <span className="text-xs text-muted-foreground">
              {t('generatedAt', {
                when: format.dateTime(new Date(kit.biosAt), { dateStyle: 'medium', timeStyle: 'short' }),
              })}
            </span>
          ) : null}
        </div>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <Globe className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="break-all">
            {kit.website ? t('website', { url: kit.website }) : t('noWebsite')}
          </span>
        </p>
        {!kit.hasProfile ? (
          <p className="text-sm">
            {t('noProfile')}{' '}
            <Link href="/app/brain" className="font-medium text-primary hover:underline">
              {t('openBrain')}
            </Link>
          </p>
        ) : null}
        {kit.canEdit && !emailVerified ? (
          <p className="text-sm text-muted-foreground">{t('unverified')}</p>
        ) : null}
        <ErrorBox error={generate.error} />
        {kit.bios ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {PROFILE_PLATFORMS.map((p) => (
              <NetworkBios
                key={p}
                brandId={brandId}
                platform={p}
                entry={kit.bios![p]}
                kit={kit}
                onChange={setKit}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t('empty')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function NetworkBios({
  brandId,
  platform,
  entry,
  kit,
  onChange,
}: {
  brandId: string
  platform: SocialPlatform
  entry: ProfileEntry
  kit: ProfileKitView
  onChange: (kit: ProfileKitView) => void
}) {
  const t = useTranslations('profileKit')
  const ta = useTranslations('profileKit.actions')
  const format = useFormatter()
  const limits = PROFILE_FIELDS[platform]
  const website = kit.website
  const [editing, setEditing] = useState(false)
  const [opened, setOpened] = useState(false)
  const fields = ORDER.filter((f) => limits[f] && (f === 'keywords' ? entry.keywords?.length : entry[f]))
  const live = kit.live.includes(platform)
  const appliedAt = kit.applied[platform]
  // tekst koji ide na profil: Google poslovni profil ima samo opis, ostale mreže prvo kratak opis
  const main =
    platform === 'google_business' ? (entry.long ?? '') : (entry.short ?? entry.long ?? entry.name ?? '')
  const save = useMutation({
    mutationFn: (next: ProfileEntry) =>
      api<ProfileKitView>(`/api/brands/${brandId}/profile-kit/bios`, {
        method: 'PATCH',
        json: { platform, entry: next },
      }),
    onSuccess: (view) => {
      onChange(view)
      setEditing(false)
    },
  })
  const apply = useMutation({
    mutationFn: () =>
      api<ProfileKitView>(`/api/brands/${brandId}/profile-kit/apply`, { method: 'POST', json: { platform } }),
    onSuccess: onChange,
  })
  const copyOpen = async () => {
    try {
      await navigator.clipboard.writeText(main)
    } catch {
      // pregledač bez dozvole za međuspremnik: strana se ipak otvara, a tekst ima svoje dugme za kopiranje
    }
    window.open(kit.editLinks[platform], '_blank', 'noopener,noreferrer')
    setOpened(true)
  }
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          <NetworkName platform={platform} />
        </h3>
        {kit.canEdit && !editing ? (
          <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            {ta('edit')}
          </Button>
        ) : null}
      </div>
      {editing ? (
        <BioForm
          platform={platform}
          entry={entry}
          busy={save.isPending}
          error={save.error}
          onSave={(next) => save.mutate(next)}
          onCancel={() => {
            save.reset()
            setEditing(false)
          }}
        />
      ) : (
        <>
          {fields.map((f) => {
            const label = t(`fields.${platform}.${f}` as 'fields.instagram.name')
            const value = f === 'keywords' ? entry.keywords!.join(', ') : (entry[f] as string)
            const count = f === 'keywords' ? entry.keywords!.length : chars(value)
            return <FieldRow key={f} label={label} value={value} count={count} max={limits[f]!} />
          })}
          {website && WEBSITE_FIELD.includes(platform) ? (
            platform === 'google_business' ? (
              <p className="text-xs text-muted-foreground">{t('gbpLink')}</p>
            ) : (
              <FieldRow label={t('link')} value={website} />
            )
          ) : null}
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            {live ? (
              <Button
                size="sm"
                onClick={() => apply.mutate()}
                disabled={!kit.canEdit || apply.isPending || !main}
              >
                <Upload aria-hidden />
                {apply.isPending ? ta('applying') : ta('apply')}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={copyOpen} disabled={!main}>
                <ExternalLink aria-hidden />
                {ta('copyOpen')}
              </Button>
            )}
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              {appliedAt
                ? ta('appliedAt', {
                    when: format.dateTime(new Date(appliedAt), { dateStyle: 'medium', timeStyle: 'short' }),
                  })
                : live
                  ? ta('liveHint')
                  : opened
                    ? ta('openedHint')
                    : ta('manualHint')}
            </p>
          </div>
          <ErrorBox error={apply.error} />
        </>
      )}
    </section>
  )
}

/** Izmena opisa jedne mreže: polja koja mreža ima, sa brojačem u njenoj granici. */
function BioForm({
  platform,
  entry,
  busy,
  error,
  onSave,
  onCancel,
}: {
  platform: SocialPlatform
  entry: ProfileEntry
  busy: boolean
  error: unknown
  onSave: (entry: ProfileEntry) => void
  onCancel: () => void
}) {
  const t = useTranslations('profileKit')
  const ta = useTranslations('profileKit.actions')
  const limits = PROFILE_FIELDS[platform]
  const fields = ORDER.filter((f) => limits[f])
  const [values, setValues] = useState({
    name: entry.name ?? '',
    short: entry.short ?? '',
    long: entry.long ?? '',
    keywords: (entry.keywords ?? []).join(', '),
  })
  const keywords = values.keywords
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
  const countOf = (f: ProfileField) => (f === 'keywords' ? keywords.length : chars(values[f]))
  const over = fields.some((f) => countOf(f) > limits[f]!)
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({
          ...(limits.name ? { name: values.name } : {}),
          ...(limits.short ? { short: values.short } : {}),
          ...(limits.long ? { long: values.long } : {}),
          ...(limits.keywords ? { keywords } : {}),
        })
      }}
    >
      {fields.map((f) => {
        const id = `bio-${platform}-${f}`
        const max = limits[f]!
        const count = countOf(f)
        const set = (value: string) => setValues((v) => ({ ...v, [f]: value }))
        return (
          <div key={f} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={id} className="text-xs">
                {t(`fields.${platform}.${f}` as 'fields.instagram.name')}
              </Label>
              <span
                className={cn(
                  'text-xs whitespace-nowrap tabular-nums',
                  count > max ? 'font-medium text-destructive' : 'text-muted-foreground',
                )}
              >
                {t('count', { n: count, max })}
              </span>
            </div>
            {f === 'short' || f === 'long' ? (
              <Textarea
                id={id}
                value={values[f]}
                onChange={(e) => set(e.target.value)}
                rows={f === 'long' ? 6 : 3}
                aria-invalid={count > max}
              />
            ) : (
              <Input
                id={id}
                value={values[f]}
                onChange={(e) => set(e.target.value)}
                aria-invalid={count > max}
              />
            )}
            {f === 'keywords' ? <p className="text-xs text-muted-foreground">{ta('keywordsHint')}</p> : null}
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

export function FieldRow({
  label,
  value,
  count,
  max,
}: {
  label: string
  value: string
  count?: number
  max?: number
}) {
  const t = useTranslations('profileKit')
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          {max ? (
            <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
              {t('count', { n: count ?? 0, max })}
            </span>
          ) : null}
          <Button size="xs" variant="ghost" onClick={copy} aria-label={t('copyLabel', { field: label })}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? t('copied') : t('copy')}
          </Button>
        </div>
      </div>
      <p className="rounded-md bg-muted/50 px-3 py-2 text-sm break-words whitespace-pre-line">{value}</p>
    </div>
  )
}
