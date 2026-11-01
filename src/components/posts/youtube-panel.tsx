'use client'

import { useTranslations } from 'next-intl'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { YOUTUBE_PRIVACY, youtubeOptionProblems, youtubeTitle, type YouTubeOptions } from '@/config/youtube'

/**
 * Poruke iz `youtubeOptionProblems` (deljene sa serverom, u kodu ostaju srpske, D-130) → ključ prevoda.
 * Poruka koje nema u spisku prikazuje se kakva jeste.
 */
const PROBLEM_KEYS: Record<
  string,
  'titleRequired' | 'titleTooLong' | 'angleBrackets' | 'descriptionTooLong' | 'madeForKids'
> = {
  'YouTube video traži naslov (do 100 znakova).': 'titleRequired',
  'Naslov YouTube videa može imati najviše 100 znakova.': 'titleTooLong',
  'YouTube ne dozvoljava znake < i > u naslovu i opisu.': 'angleBrackets',
  'Opis YouTube videa može imati najviše 5.000 bajtova.': 'descriptionTooLong',
  'Izaberite da li je video namenjen deci (obavezna izjava za YouTube).': 'madeForKids',
}

/**
 * YouTube Shorts (faza 8c): naslov, privatnost i izjava da li je video namenjen deci, bez unapred
 * izabranog odgovora (pravna izjava). Problemi se vide odmah, pre zakazivanja.
 */
export function YouTubePanel({
  accountId,
  value,
  postTitle,
  text,
  onChange,
  disabled,
}: {
  accountId: string
  value: YouTubeOptions
  postTitle: string
  text: string
  onChange: (next: YouTubeOptions) => void
  disabled: boolean
}) {
  const t = useTranslations('postPanels')
  const set = (patch: Partial<YouTubeOptions>) => onChange({ ...value, ...patch })
  const id = (name: string) => `yt-${name}-${accountId}`
  const title = youtubeTitle(value, postTitle || null, text)
  const problems = youtubeOptionProblems(value, title, text)
  return (
    <div className="mt-3 space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
      <p className="text-xs text-muted-foreground">{t('youtube.intro')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={id('title')}>{t('youtube.videoTitle')}</Label>
          <Input
            id={id('title')}
            maxLength={100}
            placeholder={title || t('titlePlaceholder')}
            value={value.title ?? ''}
            disabled={disabled}
            onChange={(e) => set({ title: e.target.value || null })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={id('privacy')}>{t('youtube.privacy')}</Label>
          <select
            id={id('privacy')}
            value={value.privacy}
            disabled={disabled}
            onChange={(e) => set({ privacy: e.target.value as YouTubeOptions['privacy'] })}
            className="h-9 w-full rounded-md border border-input bg-background px-2"
          >
            {YOUTUBE_PRIVACY.map((p) => (
              <option key={p} value={p}>
                {t(`youtube.privacyOptions.${p}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="space-y-1" disabled={disabled}>
        <legend className="text-sm font-medium">{t('youtube.madeForKids')}</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={id('kids')}
              checked={value.madeForKids === false}
              onChange={() => set({ madeForKids: false })}
            />
            {t('youtube.kidsNo')}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={id('kids')}
              checked={value.madeForKids === true}
              onChange={() => set({ madeForKids: true })}
            />
            {t('youtube.kidsYes')}
          </label>
        </div>
      </fieldset>
      {problems.length ? (
        <ul className="list-disc pl-5 text-xs text-amber-800" role="status">
          {problems.map((p) => {
            const key = PROBLEM_KEYS[p]
            return <li key={p}>{key ? t(`youtube.problems.${key}`) : p}</li>
          })}
        </ul>
      ) : null}
    </div>
  )
}
