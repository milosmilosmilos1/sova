'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import {
  TIKTOK_BRANDED_POLICY_URL,
  TIKTOK_MUSIC_POLICY_URL,
  tiktokOptionProblems,
  type TikTokPostOptions,
  type TikTokPrivacy,
} from '@/config/tiktok'
import type { ApiResponse } from '@/lib/api/response'

/**
 * Poruke iz `tiktokOptionProblems` (deljene sa serverom, u kodu ostaju srpske, D-130) → ključ prevoda.
 * Poruka koje nema u spisku prikazuje se kakva jeste.
 */
const PROBLEM_KEYS: Record<string, 'privacy' | 'commercialType' | 'brandedPrivate' | 'consent'> = {
  'TikTok: izaberite ko može da vidi objavu.': 'privacy',
  'TikTok: uz komercijalni sadržaj označite „Vaš brend”, „Brendirani sadržaj” ili oba.': 'commercialType',
  'TikTok: brendirani sadržaj ne može biti vidljiv samo vama.': 'brandedPrivate',
  'TikTok: potvrdite saglasnost sa TikTok pravilima o korišćenju muzike.': 'consent',
}

/**
 * TikTok podešavanja objave po UX smernicama za Direct Post (uslov za TikTok audit): nalog na koji
 * ide objava, privatnost bez unapred izabrane vrednosti, interakcije koje nalog dozvoljava (sivo kad
 * su isključene u TikTok-u), otkrivanje komercijalnog sadržaja i izričita saglasnost sa pravilima.
 */
interface CreatorInfo {
  nickname: string | null
  username: string | null
  avatarUrl: string | null
  privacyLevelOptions: TikTokPrivacy[]
  commentDisabled: boolean
  duetDisabled: boolean
  stitchDisabled: boolean
  maxVideoPostDurationSec: number | null
}

async function fetchCreator(accountId: string): Promise<CreatorInfo> {
  const res = await fetch(`/api/social-accounts/${accountId}/tiktok-creator`)
  const data = (await res.json()) as ApiResponse<CreatorInfo>
  if (!data.ok) throw new Error(data.error.message)
  return data.data
}

export function TikTokPanel({
  accountId,
  value,
  onChange,
  disabled,
  isVideo,
}: {
  accountId: string
  value: TikTokPostOptions
  onChange: (next: TikTokPostOptions) => void
  disabled: boolean
  isVideo: boolean
}) {
  const t = useTranslations('postPanels.tiktok')
  const creator = useQuery({
    queryKey: ['tiktok-creator', accountId],
    queryFn: () => fetchCreator(accountId),
    staleTime: 60_000,
    retry: 1,
  })
  const set = (patch: Partial<TikTokPostOptions>) => onChange({ ...value, ...patch })
  const info = creator.data
  const problems = tiktokOptionProblems(value)
  const disabledNote = t('disabledInTiktok')

  if (creator.isPending) return <p className="mt-2 text-xs text-muted-foreground">{t('loading')}</p>
  if (creator.isError || !info) {
    return (
      <p role="alert" className="mt-2 text-xs text-destructive">
        {creator.error instanceof Error ? creator.error.message : t('loadError')}
      </p>
    )
  }

  const name = info.nickname ?? info.username ?? 'TikTok'
  const bold = (chunks: ReactNode) => <strong>{chunks}</strong>

  return (
    <div className="mt-3 space-y-3 rounded-md bg-muted/40 p-3 text-sm">
      <p className="text-xs text-muted-foreground">
        {info.username
          ? t.rich('targetUser', { name, username: info.username, b: bold })
          : t.rich('target', { name, b: bold })}
        {isVideo && info.maxVideoPostDurationSec
          ? ` ${t('maxDuration', { seconds: info.maxVideoPostDurationSec })}`
          : ''}
      </p>

      <label className="block space-y-1">
        <span className="text-xs font-medium">{t('privacy')}</span>
        <select
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={value.privacyLevel ?? ''}
          disabled={disabled}
          onChange={(e) => set({ privacyLevel: (e.target.value || null) as TikTokPrivacy | null })}
        >
          <option value="">{t('choose')}</option>
          {info.privacyLevelOptions.map((p) => {
            // TikTok može da vrati vrednost koju još ne poznajemo: tada ide sirova vrednost
            const key = `privacyLevel.${p}` as 'privacyLevel.SELF_ONLY'
            return (
              <option key={p} value={p} disabled={p === 'SELF_ONLY' && value.brandedContent}>
                {t.has(key) ? t(key) : p}
                {p === 'SELF_ONLY' && value.brandedContent ? ` ${t('notForBranded')}` : ''}
              </option>
            )
          })}
        </select>
      </label>

      <fieldset className="space-y-1">
        <legend className="text-xs font-medium">{t('allow')}</legend>
        <Check
          label={t('comments')}
          checked={value.allowComment && !info.commentDisabled}
          disabled={disabled || info.commentDisabled}
          note={info.commentDisabled ? disabledNote : null}
          onChange={(v) => set({ allowComment: v })}
        />
        {isVideo ? (
          <>
            <Check
              label="Duet"
              checked={value.allowDuet && !info.duetDisabled}
              disabled={disabled || info.duetDisabled}
              note={info.duetDisabled ? disabledNote : null}
              onChange={(v) => set({ allowDuet: v })}
            />
            <Check
              label="Stitch"
              checked={value.allowStitch && !info.stitchDisabled}
              disabled={disabled || info.stitchDisabled}
              note={info.stitchDisabled ? disabledNote : null}
              onChange={(v) => set({ allowStitch: v })}
            />
          </>
        ) : null}
      </fieldset>

      <fieldset className="space-y-1">
        <Check
          label={t('commercial')}
          checked={value.commercial}
          disabled={disabled}
          note={t('commercialHint')}
          onChange={(v) =>
            set({ commercial: v, ...(v ? {} : { brandOrganic: false, brandedContent: false }) })
          }
        />
        {value.commercial ? (
          <div className="ml-6 space-y-1">
            <Check
              label={t('yourBrand')}
              checked={value.brandOrganic}
              disabled={disabled}
              note={t('yourBrandHint')}
              onChange={(v) => set({ brandOrganic: v })}
            />
            <Check
              label={t('branded')}
              checked={value.brandedContent}
              disabled={disabled}
              note={t('brandedHint')}
              onChange={(v) =>
                set({
                  brandedContent: v,
                  ...(v && value.privacyLevel === 'SELF_ONLY' ? { privacyLevel: null } : {}),
                })
              }
            />
          </div>
        ) : null}
      </fieldset>

      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={value.consent}
          disabled={disabled}
          onChange={(e) =>
            set({ consent: e.target.checked, consentAt: e.target.checked ? new Date().toISOString() : null })
          }
        />
        <span>
          {t.rich(value.brandedContent ? 'consentBranded' : 'consent', {
            music: (chunks) => (
              <a href={TIKTOK_MUSIC_POLICY_URL} target="_blank" rel="noreferrer" className="underline">
                {chunks}
              </a>
            ),
            branded: (chunks) => (
              <a href={TIKTOK_BRANDED_POLICY_URL} target="_blank" rel="noreferrer" className="underline">
                {chunks}
              </a>
            ),
          })}
        </span>
      </label>

      <p className="text-xs text-muted-foreground">{t('processing')}</p>
      {problems.length ? (
        <ul className="list-disc pl-5 text-xs text-amber-800">
          {problems.map((p) => {
            const key = PROBLEM_KEYS[p]
            return <li key={p}>{key ? t(`problems.${key}`) : p.replace(/^TikTok: /, '')}</li>
          })}
        </ul>
      ) : null}
    </div>
  )
}

function Check({
  label,
  checked,
  disabled,
  note,
  onChange,
}: {
  label: string
  checked: boolean
  disabled: boolean
  note: string | null
  onChange: (v: boolean) => void
}) {
  return (
    <label className={`flex items-start gap-2 text-sm ${disabled ? 'opacity-60' : ''}`}>
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {note ? <span className="block text-xs text-muted-foreground">{note}</span> : null}
      </span>
    </label>
  )
}
