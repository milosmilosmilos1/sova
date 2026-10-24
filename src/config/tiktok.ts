/**
 * TikTok podešavanja objave (Content Posting API, Direct Post) koja korisnik bira u editoru. Sve
 * iz TikTok-ovih UX smernica za audit: privatnost bez unapred izabrane vrednosti, interakcije koje
 * nalog dozvoljava, oznaka komercijalnog sadržaja i izričita saglasnost sa pravilima o muzici.
 * Deli se između editora (klijent) i servera (provera pri zakazivanju i objavi).
 */
export const TIKTOK_PRIVACY = [
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY',
] as const
export type TikTokPrivacy = (typeof TIKTOK_PRIVACY)[number]

export const TIKTOK_PRIVACY_LABEL: Record<TikTokPrivacy, string> = {
  PUBLIC_TO_EVERYONE: 'Svi',
  MUTUAL_FOLLOW_FRIENDS: 'Prijatelji (međusobno praćenje)',
  FOLLOWER_OF_CREATOR: 'Pratioci',
  SELF_ONLY: 'Samo ja',
}

export const TIKTOK_MUSIC_POLICY_URL = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en'
export const TIKTOK_BRANDED_POLICY_URL = 'https://www.tiktok.com/legal/page/global/bc-policy/en'

export interface TikTokPostOptions {
  privacyLevel: TikTokPrivacy | null
  allowComment: boolean
  allowDuet: boolean
  allowStitch: boolean
  /** prekidač „Komercijalni sadržaj”; isključen dok ga korisnik sam ne uključi */
  commercial: boolean
  /** „Vaš brend”: promoviše sopstveni posao */
  brandOrganic: boolean
  /** „Brendirani sadržaj”: plaćena saradnja sa drugim brendom */
  brandedContent: boolean
  consent: boolean
  consentAt: string | null
}

export const EMPTY_TIKTOK_OPTIONS: TikTokPostOptions = {
  privacyLevel: null,
  allowComment: false,
  allowDuet: false,
  allowStitch: false,
  commercial: false,
  brandOrganic: false,
  brandedContent: false,
  consent: false,
  consentAt: null,
}

/** Čitanje iz `post_targets.options.tiktok` (nepoznato ili neispravno → prazno, bez pretpostavki). */
export function readTikTokOptions(raw: unknown): TikTokPostOptions {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_TIKTOK_OPTIONS }
  const o = raw as Record<string, unknown>
  const privacy = TIKTOK_PRIVACY.includes(o.privacyLevel as TikTokPrivacy)
    ? (o.privacyLevel as TikTokPrivacy)
    : null
  return {
    privacyLevel: privacy,
    allowComment: o.allowComment === true,
    allowDuet: o.allowDuet === true,
    allowStitch: o.allowStitch === true,
    commercial: o.commercial === true,
    brandOrganic: o.commercial === true && o.brandOrganic === true,
    brandedContent: o.commercial === true && o.brandedContent === true,
    consent: o.consent === true,
    consentAt: typeof o.consentAt === 'string' ? o.consentAt : null,
  }
}

/** Šta još fali pre zakazivanja; prazna lista = spremno. */
export function tiktokOptionProblems(o: TikTokPostOptions): string[] {
  const problems: string[] = []
  if (!o.privacyLevel) problems.push('TikTok: izaberite ko može da vidi objavu.')
  if (o.commercial && !o.brandOrganic && !o.brandedContent)
    problems.push('TikTok: uz komercijalni sadržaj označite „Vaš brend”, „Brendirani sadržaj” ili oba.')
  if (o.brandedContent && o.privacyLevel === 'SELF_ONLY')
    problems.push('TikTok: brendirani sadržaj ne može biti vidljiv samo vama.')
  if (!o.consent) problems.push('TikTok: potvrdite saglasnost sa TikTok pravilima o korišćenju muzike.')
  return problems
}
