import type { SocialPlatform } from '@/config/platforms'

/**
 * Primena opisa profila (D-166). Sova sama upisuje opis samo gde mreža to dozvoljava i gde Sova već
 * ima dozvolu: Google poslovni profil (Business Information API, `profile.description`, uz
 * `business.manage`). Facebook stranica (`pages_manage_metadata`), YouTube kanal (`youtube`),
 * LinkedIn stranica firme (Community Management API) i X (`PUT /2/users/me`) to dozvoljavaju tek uz
 * dozvolu koju Sova još nema; Instagram, TikTok i Pinterest uopšte ne dozvoljavaju izmenu opisa preko
 * API-ja. Za njih „Kopiraj i otvori” kopira tekst i otvara stranu za izmenu profila na mreži.
 */
export const PROFILE_APPLY_LIVE: readonly SocialPlatform[] = ['google_business']

export interface ProfileAccountRef {
  externalId: string
  username: string | null
  accountType: string
}

/** Strana za izmenu profila na mreži; povezan nalog daje tačnu adresu gde je mreža ima. */
export function profileEditUrl(platform: SocialPlatform, account?: ProfileAccountRef | null): string {
  switch (platform) {
    case 'instagram':
      return 'https://www.instagram.com/accounts/edit/'
    case 'facebook':
      return account
        ? `https://www.facebook.com/${encodeURIComponent(account.externalId)}`
        : 'https://www.facebook.com/pages/?category=your_pages'
    case 'linkedin':
      return account?.accountType === 'linkedin_organization'
        ? `https://www.linkedin.com/company/${encodeURIComponent(account.externalId)}/admin/`
        : 'https://www.linkedin.com/in/me/'
    case 'tiktok':
      return account?.username
        ? `https://www.tiktok.com/@${encodeURIComponent(account.username.replace(/^@/, ''))}`
        : 'https://www.tiktok.com/'
    case 'x':
      return 'https://x.com/settings/profile'
    case 'youtube':
      return account
        ? `https://studio.youtube.com/channel/${encodeURIComponent(account.externalId)}/editing/details`
        : 'https://studio.youtube.com/'
    case 'pinterest':
      return 'https://www.pinterest.com/settings/'
    case 'google_business':
      return 'https://business.google.com/'
  }
}
