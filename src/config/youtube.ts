/**
 * Podešavanja YouTube Shorts objave po targetu (`post_targets.options.youtube`): naslov, privatnost i
 * izjava da li je video namenjen deci. Izjava nema podrazumevanu vrednost: to je pravna izjava
 * (COPPA) koju korisnik daje svesno, kao i privatnost na TikTok-u.
 */
export const YOUTUBE_PRIVACY = ['public', 'unlisted', 'private'] as const
export type YouTubePrivacy = (typeof YOUTUBE_PRIVACY)[number]

export const YOUTUBE_PRIVACY_LABELS: Record<YouTubePrivacy, string> = {
  public: 'Javno',
  unlisted: 'Nelistano (samo sa linkom)',
  private: 'Privatno',
}

/** Short: vertikalan ili kvadratan video do 3 minuta (YouTube od 15.10.2024). */
export const SHORTS_MAX_MS = 180_000

export interface YouTubeOptions {
  /** prazno = naslov objave */
  title: string | null
  privacy: YouTubePrivacy
  madeForKids: boolean | null
}

export function readYouTubeOptions(options: Record<string, unknown> | null | undefined): YouTubeOptions {
  const o = (options?.youtube ?? {}) as Record<string, unknown>
  return {
    title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : null,
    privacy: YOUTUBE_PRIVACY.includes(o.privacy as YouTubePrivacy) ? (o.privacy as YouTubePrivacy) : 'public',
    madeForKids: typeof o.madeForKids === 'boolean' ? o.madeForKids : null,
  }
}

/** Naslov videa: iz podešavanja, pa naslov objave, pa prvi red teksta. */
export function youtubeTitle(o: YouTubeOptions, postTitle: string | null | undefined, text: string): string {
  return (o.title ?? postTitle?.trim() ?? text.split('\n')[0]?.trim() ?? '').slice(0, 100)
}

export function youtubeOptionProblems(o: YouTubeOptions, title: string, description: string): string[] {
  const problems: string[] = []
  if (!title) problems.push('YouTube video traži naslov (do 100 znakova).')
  if (o.title && o.title.length > 100) problems.push('Naslov YouTube videa može imati najviše 100 znakova.')
  if (/[<>]/.test(title) || /[<>]/.test(description))
    problems.push('YouTube ne dozvoljava znake < i > u naslovu i opisu.')
  // limit je u bajtovima (UTF-8), ne u znakovima; TextEncoder radi i u pregledaču
  if (new TextEncoder().encode(description).length > 5000)
    problems.push('Opis YouTube videa može imati najviše 5.000 bajtova.')
  if (o.madeForKids === null)
    problems.push('Izaberite da li je video namenjen deci (obavezna izjava za YouTube).')
  return problems
}
