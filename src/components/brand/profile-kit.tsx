'use client'

import { useMutation } from '@tanstack/react-query'
import { Check, Copy, Globe } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { NetworkName } from '@/components/shared/network-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { SocialPlatform } from '@/config/platforms'
import {
  PROFILE_FIELDS,
  PROFILE_PLATFORMS,
  WEBSITE_FIELD,
  type ProfileEntry,
  type ProfileField,
} from '@/lib/ai/prompts/profile-bios'
import type { ProfileKitView } from '@/services/brand-brain/profile-kit'

const ORDER: ProfileField[] = ['name', 'short', 'long', 'keywords']

/**
 * Opisi profila po mreži (D-143): jedno dugme piše opise za svih osam mreža, a svako polje ima brojač
 * znakova u granici mreže i dugme za kopiranje, jer mreže ne dozvoljavaju da ih Sova sama upiše.
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
              <NetworkBios key={p} platform={p} entry={kit.bios![p]} website={kit.website} />
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
  platform,
  entry,
  website,
}: {
  platform: SocialPlatform
  entry: ProfileEntry
  website: string | null
}) {
  const t = useTranslations('profileKit')
  const limits = PROFILE_FIELDS[platform]
  const fields = ORDER.filter((f) => limits[f] && (f === 'keywords' ? entry.keywords?.length : entry[f]))
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">
        <NetworkName platform={platform} />
      </h3>
      {fields.map((f) => {
        const label = t(`fields.${platform}.${f}` as 'fields.instagram.name')
        const value = f === 'keywords' ? entry.keywords!.join(', ') : (entry[f] as string)
        const count = f === 'keywords' ? entry.keywords!.length : Array.from(value).length
        return <FieldRow key={f} label={label} value={value} count={count} max={limits[f]!} />
      })}
      {website && WEBSITE_FIELD.includes(platform) ? (
        platform === 'google_business' ? (
          <p className="text-xs text-muted-foreground">{t('gbpLink')}</p>
        ) : (
          <FieldRow label={t('link')} value={website} />
        )
      ) : null}
    </section>
  )
}

function FieldRow({
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
            <span className="text-xs text-muted-foreground tabular-nums">
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
