'use client'

import { useQuery } from '@tanstack/react-query'

import {
  TIKTOK_BRANDED_POLICY_URL,
  TIKTOK_MUSIC_POLICY_URL,
  TIKTOK_PRIVACY_LABEL,
  tiktokOptionProblems,
  type TikTokPostOptions,
  type TikTokPrivacy,
} from '@/config/tiktok'
import type { ApiResponse } from '@/lib/api/response'

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
  const creator = useQuery({
    queryKey: ['tiktok-creator', accountId],
    queryFn: () => fetchCreator(accountId),
    staleTime: 60_000,
    retry: 1,
  })
  const set = (patch: Partial<TikTokPostOptions>) => onChange({ ...value, ...patch })
  const info = creator.data
  const problems = tiktokOptionProblems(value)

  if (creator.isPending)
    return <p className="mt-2 text-xs text-muted-foreground">Učitavam podešavanja TikTok naloga…</p>
  if (creator.isError || !info) {
    return (
      <p role="alert" className="mt-2 text-xs text-destructive">
        {creator.error instanceof Error ? creator.error.message : 'TikTok podešavanja nisu učitana.'}
      </p>
    )
  }

  return (
    <div className="mt-3 space-y-3 rounded-md bg-muted/40 p-3 text-sm">
      <p className="text-xs text-muted-foreground">
        Objava ide na TikTok nalog <strong>{info.nickname ?? info.username ?? 'TikTok'}</strong>
        {info.username ? ` (@${info.username})` : ''}.
        {isVideo && info.maxVideoPostDurationSec
          ? ` Najduži video za ovaj nalog: ${info.maxVideoPostDurationSec} s.`
          : ''}
      </p>

      <label className="block space-y-1">
        <span className="text-xs font-medium">Ko može da vidi objavu</span>
        <select
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={value.privacyLevel ?? ''}
          disabled={disabled}
          onChange={(e) => set({ privacyLevel: (e.target.value || null) as TikTokPrivacy | null })}
        >
          <option value="">Izaberite…</option>
          {info.privacyLevelOptions.map((p) => (
            <option key={p} value={p} disabled={p === 'SELF_ONLY' && value.brandedContent}>
              {TIKTOK_PRIVACY_LABEL[p] ?? p}
              {p === 'SELF_ONLY' && value.brandedContent ? ' (nije dostupno za brendirani sadržaj)' : ''}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-1">
        <legend className="text-xs font-medium">Dozvolite korisnicima</legend>
        <Check
          label="Komentare"
          checked={value.allowComment && !info.commentDisabled}
          disabled={disabled || info.commentDisabled}
          note={info.commentDisabled ? 'isključeno u podešavanjima TikTok naloga' : null}
          onChange={(v) => set({ allowComment: v })}
        />
        {isVideo ? (
          <>
            <Check
              label="Duet"
              checked={value.allowDuet && !info.duetDisabled}
              disabled={disabled || info.duetDisabled}
              note={info.duetDisabled ? 'isključeno u podešavanjima TikTok naloga' : null}
              onChange={(v) => set({ allowDuet: v })}
            />
            <Check
              label="Stitch"
              checked={value.allowStitch && !info.stitchDisabled}
              disabled={disabled || info.stitchDisabled}
              note={info.stitchDisabled ? 'isključeno u podešavanjima TikTok naloga' : null}
              onChange={(v) => set({ allowStitch: v })}
            />
          </>
        ) : null}
      </fieldset>

      <fieldset className="space-y-1">
        <Check
          label="Otkrij komercijalni sadržaj"
          checked={value.commercial}
          disabled={disabled}
          note="objava promoviše brend, proizvod ili uslugu"
          onChange={(v) =>
            set({ commercial: v, ...(v ? {} : { brandOrganic: false, brandedContent: false }) })
          }
        />
        {value.commercial ? (
          <div className="ml-6 space-y-1">
            <Check
              label="Vaš brend"
              checked={value.brandOrganic}
              disabled={disabled}
              note="promovišete sopstveni posao; objava dobija oznaku „Promotivni sadržaj”"
              onChange={(v) => set({ brandOrganic: v })}
            />
            <Check
              label="Brendirani sadržaj"
              checked={value.brandedContent}
              disabled={disabled}
              note="plaćena saradnja sa drugim brendom; objava dobija oznaku „Plaćeno partnerstvo”"
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
          Objavljivanjem prihvatam TikTok-ovu{' '}
          <a href={TIKTOK_MUSIC_POLICY_URL} target="_blank" rel="noreferrer" className="underline">
            Potvrdu o korišćenju muzike
          </a>
          {value.brandedContent ? (
            <>
              {' '}
              i{' '}
              <a href={TIKTOK_BRANDED_POLICY_URL} target="_blank" rel="noreferrer" className="underline">
                Politiku brendiranog sadržaja
              </a>
            </>
          ) : null}
          .
        </span>
      </label>

      <p className="text-xs text-muted-foreground">
        TikTok obrađuje objavu posle termina; na profilu se pojavljuje za nekoliko minuta.
      </p>
      {problems.length ? (
        <ul className="list-disc pl-5 text-xs text-amber-800">
          {problems.map((p) => (
            <li key={p}>{p.replace(/^TikTok: /, '')}</li>
          ))}
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
