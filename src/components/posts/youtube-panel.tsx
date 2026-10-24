'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  YOUTUBE_PRIVACY,
  YOUTUBE_PRIVACY_LABELS,
  youtubeOptionProblems,
  youtubeTitle,
  type YouTubeOptions,
} from '@/config/youtube'

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
  const set = (patch: Partial<YouTubeOptions>) => onChange({ ...value, ...patch })
  const id = (name: string) => `yt-${name}-${accountId}`
  const title = youtubeTitle(value, postTitle || null, text)
  const problems = youtubeOptionProblems(value, title, text)
  return (
    <div className="mt-3 space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
      <p className="text-xs text-muted-foreground">
        Short je vertikalan ili kvadratan video do 3 minuta; tekst objave ide u opis videa.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={id('title')}>Naslov videa</Label>
          <Input
            id={id('title')}
            maxLength={100}
            placeholder={title || 'Naslov (do 100 znakova)'}
            value={value.title ?? ''}
            disabled={disabled}
            onChange={(e) => set({ title: e.target.value || null })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={id('privacy')}>Privatnost</Label>
          <select
            id={id('privacy')}
            value={value.privacy}
            disabled={disabled}
            onChange={(e) => set({ privacy: e.target.value as YouTubeOptions['privacy'] })}
            className="h-9 w-full rounded-md border border-input bg-background px-2"
          >
            {YOUTUBE_PRIVACY.map((p) => (
              <option key={p} value={p}>
                {YOUTUBE_PRIVACY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="space-y-1" disabled={disabled}>
        <legend className="text-sm font-medium">Da li je video namenjen deci?</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={id('kids')}
              checked={value.madeForKids === false}
              onChange={() => set({ madeForKids: false })}
            />
            Ne, nije namenjen deci
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={id('kids')}
              checked={value.madeForKids === true}
              onChange={() => set({ madeForKids: true })}
            />
            Da, namenjen je deci
          </label>
        </div>
      </fieldset>
      {problems.length ? (
        <ul className="list-disc pl-5 text-xs text-amber-800" role="status">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
