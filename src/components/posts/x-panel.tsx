'use client'

import { useTranslations } from 'next-intl'

import { xThreadParts, type XOptions } from '@/config/x'
import { composeXText, containsUrl, X_TEXT_MAX, xWeightedLength } from '@/lib/x-text'

/** Cena na X-u (D-013): objava 1 token, objava sa linkom 6; nit plaća svaki deo. */
const X_COST = { plain: 1, link: 6 }

/**
 * Objava na X-u (D-150): cena objave ili cele niti i, kad je tekst duži od 280 znakova, izbor da ide
 * kao nit (podrazumevano) i da delovi imaju „1/5”.
 */
export function XPanel({
  accountId,
  value,
  text,
  link,
  onChange,
  disabled,
}: {
  accountId: string
  value: XOptions
  text: string
  link: string | null
  onChange: (next: XOptions) => void
  disabled: boolean
}) {
  const t = useTranslations('postPanels')
  const te = useTranslations('postEditor')
  const composed = composeXText({ text, link })
  const parts = xThreadParts(composed, value)
  const long = xWeightedLength(composed) > X_TEXT_MAX
  const cost = parts.reduce((sum, p) => sum + (containsUrl(p) ? X_COST.link : X_COST.plain), 0)
  const withLink = Boolean(link) || containsUrl(composed)
  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs text-muted-foreground">
        {parts.length > 1
          ? t('x.threadCost', { cost, parts: parts.length })
          : te(withLink ? 'xCostLink' : 'xCost', { cost: withLink ? X_COST.link : X_COST.plain })}
      </p>
      {long ? (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
          <label className="flex items-start gap-2">
            <input
              id={`x-thread-${accountId}`}
              type="checkbox"
              className="mt-0.5"
              checked={value.thread}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, thread: e.target.checked })}
            />
            <span>
              {t('x.thread', { parts: xThreadParts(composed, { ...value, thread: true }).length })}
              <span className="block text-xs text-muted-foreground">{t('x.threadHint')}</span>
            </span>
          </label>
          {value.thread ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={value.numbered}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, numbered: e.target.checked })}
              />
              {t('x.numbered')}
            </label>
          ) : (
            <p className="text-xs text-red-700 dark:text-red-400">{t('x.tooLong', { max: X_TEXT_MAX })}</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
