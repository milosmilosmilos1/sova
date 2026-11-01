'use client'

import { useQueryClient } from '@tanstack/react-query'
import { ImageUp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { ThemeNotice } from '@/components/design/theme-notice'
import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { uploadMediaFile } from '@/lib/media/client-upload'

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']

/**
 * Logo na strani Brain (D-133): logo koji ide na slajdove, odakle je (vaš ili sa sajta) i otpremanje
 * pravog kad Sova sa sajta uzme pogrešan. Otpremljen logo je „vaš logo” iz Vizuelnog identiteta
 * (D-113), pa ga analiza sajta ne menja; posle promene Sova odmah usklađuje nacrte koji čekaju.
 */
export function ProfileLogo({
  brandId,
  logoUrl,
  source,
  canEdit,
}: {
  brandId: string
  logoUrl: string | null
  source: 'custom' | 'site' | null
  canEdit: boolean
}) {
  const t = useTranslations('brandBrain.logo')
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  // promena logoa pokreće usklađivanje nacrta (isti tekst i fotografije, nov logo)
  const [changedAt, setChangedAt] = useState(0)

  const setLogo = async (logoAssetId: string | null) => {
    await api(`/api/brands/${brandId}/design`, { method: 'PATCH', json: { logoAssetId } })
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['brand-profile', brandId] }),
      qc.invalidateQueries({ queryKey: ['design', brandId] }),
    ])
    setChangedAt(Date.now())
  }

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const pick = (file: File | undefined) => {
    if (!file) return
    if (!LOGO_TYPES.includes(file.type)) return setError(new Error(t('notImage')))
    void run(async () => setLogo((await uploadMediaFile(file, { brandId })).id))
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- potpisan URL logoa
          <img src={logoUrl} alt={t('alt')} className="max-h-16 max-w-56 rounded border bg-white p-1" />
        ) : (
          <span className="text-muted-foreground">{t('missing')}</span>
        )}
        {source ? (
          <span className="text-xs text-muted-foreground">
            {source === 'custom' ? t('custom') : t('fromSite')}
          </span>
        ) : null}
      </div>
      {canEdit ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <ImageUp className="size-4" aria-hidden />
              {busy ? t('uploading') : logoUrl ? t('replace') : t('upload')}
            </Button>
            {source === 'custom' ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void run(() => setLogo(null))}
              >
                {t('backToSite')}
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
                pick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t('hint')}</p>
          <ErrorBox error={error} />
          {changedAt ? <ThemeNotice brandId={brandId} canEdit={canEdit} startKey={changedAt} /> : null}
        </>
      ) : null}
    </div>
  )
}
