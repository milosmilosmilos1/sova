'use client'

import { Download } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { BANNER_KINDS, BANNER_TEXT_LIMITS, PROFILE_BANNERS, type BannerKind } from '@/config/profile-banners'
import type { ProfileKitView } from '@/services/brand-brain/profile-kit'

type Fields = { title: string; subtitle: string; footer: string }
const FIELDS = ['title', 'subtitle', 'footer'] as const

/**
 * Naslovne slike profila (D-145): Facebook, LinkedIn, X, YouTube i Pinterest u bojama, fontu i logou
 * brenda. Tekst je zajednički za sve, a pregled se crta pola sekunde posle poslednje izmene.
 */
export function BannersCard({ brandId, initial }: { brandId: string; initial: ProfileKitView }) {
  const t = useTranslations('profileKit.banners')
  const [fields, setFields] = useState<Fields>({
    title: initial.banners.title,
    subtitle: initial.banners.subtitle,
    footer: initial.banners.footer,
  })
  const [logo, setLogo] = useState(initial.banners.hasLogo)
  const [shown, setShown] = useState({ ...fields, logo })
  useEffect(() => {
    const id = window.setTimeout(() => setShown({ ...fields, logo }), 500)
    return () => window.clearTimeout(id)
  }, [fields, logo])

  const base = `/api/brands/${brandId}/profile-kit/banners`
  const query = (extra: Record<string, string> = {}) =>
    new URLSearchParams({
      title: shown.title,
      subtitle: shown.subtitle,
      footer: shown.footer,
      logo: shown.logo ? '1' : '0',
      v: initial.designKey,
      ...extra,
    }).toString()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_2fr_1fr]">
          {FIELDS.map((f) => (
            <div key={f} className="space-y-1.5">
              <Label htmlFor={`banner-${f}`}>{t(`fields.${f}`)}</Label>
              <Input
                id={`banner-${f}`}
                value={fields[f]}
                maxLength={BANNER_TEXT_LIMITS[f]}
                onChange={(e) => setFields((v) => ({ ...v, [f]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {initial.banners.hasLogo ? (
              <label className="flex items-center gap-2">
                <Switch checked={logo} onCheckedChange={(v) => setLogo(Boolean(v))} aria-label={t('logo')} />
                {t('logo')}
              </label>
            ) : null}
            <span className="text-muted-foreground">
              {t('design')}{' '}
              <Link href="/app/brand/visual" className="font-medium text-primary hover:underline">
                {t('designLink')}
              </Link>
            </span>
          </div>
          <Button variant="outline" nativeButton={false} render={<a href={`${base}?${query()}`} />}>
            <Download aria-hidden />
            {t('downloadAll')}
          </Button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {BANNER_KINDS.map((kind) => (
            <BannerTile
              key={kind}
              kind={kind}
              src={`${base}/${kind}?${query({ preview: '1' })}`}
              download={`${base}/${kind}?${query({ download: '1' })}`}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function BannerTile({ kind, src, download }: { kind: BannerKind; src: string; download: string }) {
  const t = useTranslations('profileKit.banners')
  const { width, height } = PROFILE_BANNERS[kind]
  const name = t(`kinds.${kind}`)
  return (
    <section className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {name}{' '}
          <span className="font-normal text-muted-foreground tabular-nums">
            {t('size', { width, height })}
          </span>
        </h3>
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<a href={download} />}
          aria-label={t('downloadLabel', { name })}
        >
          <Download aria-hidden />
          {t('download')}
        </Button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- naslovna iz API-ja, bez optimizacije */}
      <img
        src={src}
        alt={t('alt', { name })}
        width={width}
        height={height}
        loading="lazy"
        className="h-auto w-full rounded-md border bg-muted"
      />
      <p className="text-xs text-muted-foreground">{t(`notes.${kind}`)}</p>
    </section>
  )
}
