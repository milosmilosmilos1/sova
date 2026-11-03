'use client'

import { useTranslations } from 'next-intl'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  LINKEDIN_CAROUSEL_MODES,
  LINKEDIN_DOCUMENT_TITLE_MAX,
  linkedinDocumentTitle,
  type LinkedInOptions,
} from '@/config/linkedin'

/**
 * LinkedIn objava sa više slika (D-149): PDF dokument koji se prevlači strana po strana ili mreža
 * slika. „Automatski” šalje slajdove koje je nacrtala Sova kao dokument, a fotografije kao mrežu.
 */
export function LinkedInPanel({
  accountId,
  value,
  postTitle,
  text,
  onChange,
  disabled,
}: {
  accountId: string
  value: LinkedInOptions
  postTitle: string
  text: string
  onChange: (next: LinkedInOptions) => void
  disabled: boolean
}) {
  const t = useTranslations('postPanels')
  const set = (patch: Partial<LinkedInOptions>) => onChange({ ...value, ...patch })
  const id = (name: string) => `li-${name}-${accountId}`
  return (
    <div className="mt-3 space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
      <p className="text-xs text-muted-foreground">{t('linkedin.intro')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={id('carousel')}>{t('linkedin.carousel')}</Label>
          <select
            id={id('carousel')}
            value={value.carousel}
            disabled={disabled}
            onChange={(e) => set({ carousel: e.target.value as LinkedInOptions['carousel'] })}
            className="h-9 w-full rounded-md border border-input bg-background px-2"
          >
            {LINKEDIN_CAROUSEL_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`linkedin.modes.${m}`)}
              </option>
            ))}
          </select>
        </div>
        {value.carousel !== 'images' ? (
          <div className="space-y-1">
            <Label htmlFor={id('title')}>{t('linkedin.documentTitle')}</Label>
            <Input
              id={id('title')}
              maxLength={LINKEDIN_DOCUMENT_TITLE_MAX}
              placeholder={linkedinDocumentTitle({ ...value, documentTitle: null }, postTitle || null, text)}
              value={value.documentTitle ?? ''}
              disabled={disabled}
              onChange={(e) => set({ documentTitle: e.target.value || null })}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
