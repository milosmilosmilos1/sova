'use client'

import { useMutation } from '@tanstack/react-query'
import { Check, ImageUp, RotateCcw, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { uploadMediaFile } from '@/lib/media/client-upload'
import { cn } from '@/lib/utils'
import type { ProfileKitView, ProfileLook } from '@/services/brand-brain/profile-kit'
import type { SiteLogoOption } from '@/services/design/site-logos'

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']

interface LookState {
  look: ProfileLook
  setLook: (look: ProfileLook) => void
  /** deo adrese slika: menja se sa bojom i logoom, da pregledač ne prikaže staru sliku */
  key: string
}

const LookContext = createContext<LookState | null>(null)

/** Zajednička boja i logo za kartice sa slikama profila (D-148). */
export function ProfileLookProvider({ initial, children }: { initial: ProfileLook; children: ReactNode }) {
  const [look, setLook] = useState(initial)
  const key = `${look.color}-${look.logoAssetId ?? 'nologo'}`
  return <LookContext.Provider value={{ look, setLook, key }}>{children}</LookContext.Provider>
}

/** Boja i logo iz kartice „Boja i logo”; bez nje kartica radi sa onim što je stiglo sa strane. */
export function useProfileLook(fallback: ProfileLook): LookState {
  const ctx = useContext(LookContext)
  return (
    ctx ?? {
      look: fallback,
      setLook: () => undefined,
      key: `${fallback.color}-${fallback.logoAssetId ?? ''}`,
    }
  )
}

/**
 * Boja i logo za slike profila (D-148): tri boje sa sajta brenda (ili svoja) i logo sa sajta. Kad
 * analiza nije pogodila logo, korisnik bira drugi sa iste strane ili otprema svoj; logo važi i za
 * objave, kao u Vizuelnom identitetu.
 */
export function ProfileLookCard({ brandId, canEdit }: { brandId: string; canEdit: boolean }) {
  const t = useTranslations('profileKit.look')
  const ctx = useContext(LookContext)
  if (!ctx) throw new Error('ProfileLookCard mora biti u ProfileLookProvider')
  const { look, setLook } = ctx

  const refresh = async () => setLook((await api<ProfileKitView>(`/api/brands/${brandId}/profile-kit`)).look)
  const color = useMutation({
    mutationFn: (value: string | null) =>
      api<ProfileKitView>(`/api/brands/${brandId}/profile-kit`, {
        method: 'PATCH',
        json: { color: value },
      }),
    onSuccess: (view) => {
      setLook(view.look)
      setDraft(null)
    },
  })
  const logo = useMutation({
    mutationFn: async (logoAssetId: string | null) => {
      await api(`/api/brands/${brandId}/design`, {
        method: 'PATCH',
        json: { logoAssetId },
      })
      await refresh()
    },
  })
  const busy = !canEdit || color.isPending || logo.isPending
  // birač boje javlja svaki pomeraj; čuva se kad korisnik stane
  const [draft, setDraft] = useState<string | null>(null)
  const save = color.mutate
  useEffect(() => {
    if (!draft) return
    const id = window.setTimeout(() => save(draft), 600)
    return () => window.clearTimeout(id)
  }, [draft, save])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h3 className="text-sm font-medium">{t('colorTitle')}</h3>
          <div className="flex flex-wrap items-center gap-3">
            {look.colors.map((c) => (
              <Swatch
                key={c}
                color={c}
                selected={look.color === c}
                label={t('colorLabel', { color: c })}
                disabled={busy}
                onClick={() => color.mutate(c === look.colors[0] ? null : c)}
              />
            ))}
            <label
              className={cn(
                'flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm',
                !look.colors.includes(look.color) && 'border-primary ring-2 ring-primary/30',
              )}
            >
              <input
                type="color"
                value={draft ?? look.color}
                disabled={busy}
                className="size-7 cursor-pointer rounded border-0 bg-transparent p-0 disabled:cursor-not-allowed"
                onChange={(e) => setDraft(e.target.value.toUpperCase())}
              />
              {t('custom')}
            </label>
          </div>
          <p className="text-xs text-muted-foreground">{t('colorHint')}</p>
          <ErrorBox error={color.error} />
        </section>
        <LogoSection
          brandId={brandId}
          look={look}
          busy={busy}
          pending={logo.isPending}
          onPick={(id) => logo.mutate(id)}
          onPicked={refresh}
          error={logo.error}
        />
      </CardContent>
    </Card>
  )
}

function Swatch({
  color,
  selected,
  label,
  disabled,
  onClick,
}: {
  color: string
  selected: boolean
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex size-10 items-center justify-center rounded-full border-2 border-background shadow-sm ring-2 ring-border transition disabled:cursor-not-allowed disabled:opacity-60',
        selected && 'ring-primary',
      )}
      style={{ backgroundColor: color }}
    >
      {selected ? <Check className="size-4 text-white mix-blend-difference" aria-hidden /> : null}
    </button>
  )
}

function LogoSection({
  brandId,
  look,
  busy,
  pending,
  onPick,
  onPicked,
  error,
}: {
  brandId: string
  look: ProfileLook
  busy: boolean
  pending: boolean
  onPick: (assetId: string | null) => void
  onPicked: () => Promise<void>
  error: unknown
}) {
  const t = useTranslations('profileKit.look')
  const input = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<unknown>(null)
  const [uploading, setUploading] = useState(false)
  const options = useMutation({
    mutationFn: () => api<{ logos: SiteLogoOption[] }>(`/api/brands/${brandId}/design/logos`),
  })
  const pick = useMutation({
    mutationFn: async (sourceUrl: string) => {
      await api(`/api/brands/${brandId}/design/logos`, {
        method: 'POST',
        json: { sourceUrl },
      })
      await onPicked()
    },
    onSuccess: () => options.reset(),
  })
  const working = busy || uploading || pick.isPending

  const upload = async (file: File | undefined) => {
    setUploadError(null)
    if (!file) return
    if (!LOGO_TYPES.includes(file.type)) return setUploadError(new Error(t('notImage')))
    setUploading(true)
    try {
      const asset = await uploadMediaFile(file, { brandId })
      onPick(asset.id)
    } catch (err) {
      setUploadError(err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{t('logoTitle')}</h3>
        <span className="text-xs text-muted-foreground">
          {look.logoSource === 'custom'
            ? t('logoCustom')
            : look.logoSource === 'site'
              ? t('logoSite')
              : t('logoNone')}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex size-24 shrink-0 items-center justify-center rounded-lg border bg-white p-2">
          {look.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- potpisan URL logoa
            <img src={look.logoUrl} alt={t('logoAlt')} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-center text-xs text-neutral-500">{t('logoEmpty')}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {look.hasWebsite ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={working || options.isPending}
              onClick={() => options.mutate()}
            >
              <Search aria-hidden />
              {options.isPending ? t('searching') : t('fromSite')}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={working}
            onClick={() => input.current?.click()}
          >
            <ImageUp aria-hidden />
            {uploading || pending ? t('uploading') : t('upload')}
          </Button>
          {look.logoSource === 'custom' ? (
            <Button type="button" size="sm" variant="ghost" disabled={working} onClick={() => onPick(null)}>
              <RotateCcw aria-hidden />
              {t('reset')}
            </Button>
          ) : null}
          <input
            ref={input}
            type="file"
            accept={LOGO_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              void upload(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
      </div>
      {options.data ? (
        options.data.logos.length ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t('optionsHint')}</p>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {options.data.logos.map((l, i) => (
                <li key={l.sourceUrl}>
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => pick.mutate(l.sourceUrl)}
                    className="flex h-24 w-full items-center justify-center rounded-lg border bg-white p-2 transition hover:border-primary disabled:opacity-60"
                    aria-label={t('optionLabel', { n: i + 1 })}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- pregled kao data URI */}
                    <img src={l.preview} alt="" className="max-h-full max-w-full object-contain" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('noOptions')}</p>
        )
      ) : null}
      <p className="text-xs text-muted-foreground">{t('logoHint')}</p>
      <ErrorBox error={uploadError ?? options.error ?? pick.error ?? error} />
    </section>
  )
}
