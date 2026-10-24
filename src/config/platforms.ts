import { xWeightedLength } from '@/lib/x-text'
import type { Database } from '@/types/database'

export type SocialPlatform = Database['public']['Enums']['social_platform']

export interface PlatformConstraints {
  label: string
  /** maksimalan broj karaktera glavnog teksta */
  textMax: number
  /** preporučen i maksimalan broj hashtagova */
  hashtagsRecommended: number
  hashtagsMax: number
  /** dozvoljeni MIME tipovi slika koje API prihvata */
  imageMime: string[]
  /** odnosi stranica slike koje mreža prihvata (širina/visina, min–max) */
  imageAspect: { min: number; max: number }
  imageMaxPerPost: number
  video: { maxSeconds: number; maxBytes: number } | null
  /** da li mreža podržava oznaku AI sadržaja kroz API */
  aiLabel: boolean
  /** da li link u tekstu ima posebnu cenu ili tretman */
  linkNote?: string
}

/**
 * Ograničenja mreža. Vrednosti su iz zvanične dokumentacije pročitane 23.10.2026
 * (docs/INTEGRATIONS.md); svaka se ponovo proverava pri implementaciji mreže u fazi 8.
 */
export const PLATFORMS: Record<SocialPlatform, PlatformConstraints> = {
  facebook: {
    label: 'Facebook',
    textMax: 63206,
    hashtagsRecommended: 3,
    hashtagsMax: 30,
    imageMime: ['image/jpeg', 'image/png', 'image/webp'],
    imageAspect: { min: 0.8, max: 1.91 },
    imageMaxPerPost: 10,
    video: { maxSeconds: 14400, maxBytes: 4 * 1024 ** 3 },
    aiLabel: false,
  },
  instagram: {
    label: 'Instagram',
    textMax: 2200,
    hashtagsRecommended: 5,
    hashtagsMax: 30,
    imageMime: ['image/jpeg'],
    imageAspect: { min: 0.8, max: 1.91 },
    imageMaxPerPost: 20,
    video: { maxSeconds: 900, maxBytes: 1024 ** 3 },
    aiLabel: true,
  },
  linkedin: {
    label: 'LinkedIn',
    textMax: 3000,
    hashtagsRecommended: 3,
    hashtagsMax: 10,
    imageMime: ['image/jpeg', 'image/png', 'image/gif'],
    imageAspect: { min: 0.5, max: 2.0 },
    imageMaxPerPost: 20,
    video: { maxSeconds: 600, maxBytes: 5 * 1024 ** 3 },
    aiLabel: false,
  },
  tiktok: {
    label: 'TikTok',
    textMax: 2200,
    hashtagsRecommended: 4,
    hashtagsMax: 30,
    imageMime: ['image/jpeg', 'image/webp'],
    imageAspect: { min: 0.5, max: 2.0 },
    imageMaxPerPost: 35,
    video: { maxSeconds: 600, maxBytes: 4 * 1024 ** 3 },
    aiLabel: true,
  },
  x: {
    label: 'X',
    textMax: 280,
    hashtagsRecommended: 2,
    hashtagsMax: 5,
    imageMime: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    imageAspect: { min: 0.33, max: 3.0 },
    imageMaxPerPost: 4,
    // od 1.9.2026: 20 minuta i 8 GB (Premium više); 140 s važi još samo za DM
    video: { maxSeconds: 1200, maxBytes: 8 * 1024 ** 3 },
    aiLabel: false,
    linkNote: 'Objava sa linkom košta više (pay-per-use); URL se broji kao 23 karaktera.',
  },
  youtube: {
    label: 'YouTube Shorts',
    textMax: 5000,
    hashtagsRecommended: 3,
    hashtagsMax: 15,
    imageMime: ['image/jpeg', 'image/png'],
    imageAspect: { min: 0.5625, max: 0.5625 },
    imageMaxPerPost: 1,
    video: { maxSeconds: 180, maxBytes: 256 * 1024 ** 3 },
    aiLabel: true,
  },
  pinterest: {
    label: 'Pinterest',
    textMax: 800,
    hashtagsRecommended: 3,
    hashtagsMax: 20,
    imageMime: ['image/jpeg', 'image/png', 'image/webp'],
    imageAspect: { min: 0.5, max: 1.91 },
    imageMaxPerPost: 5,
    video: { maxSeconds: 900, maxBytes: 2 * 1024 ** 3 },
    aiLabel: false,
  },
  google_business: {
    label: 'Google poslovni profil',
    textMax: 1500,
    hashtagsRecommended: 0,
    hashtagsMax: 0,
    imageMime: ['image/jpeg', 'image/png'],
    imageAspect: { min: 0.5, max: 2.0 },
    imageMaxPerPost: 1,
    video: null,
    aiLabel: false,
  },
}

export const PLATFORM_KEYS = Object.keys(PLATFORMS) as SocialPlatform[]

/** X broji po težini (link 23, emoji i CJK 2, `src/lib/x-text.ts`); ostale mreže broje znakove. */
export function countTextLength(platform: SocialPlatform, text: string): number {
  return platform === 'x' ? xWeightedLength(text) : [...text].length
}

export interface TextValidation {
  ok: boolean
  length: number
  max: number
  hashtags: number
  problems: string[]
}

export function validateText(
  platform: SocialPlatform,
  text: string,
  hashtags: string[] = [],
): TextValidation {
  const c = PLATFORMS[platform]
  const full = hashtags.length ? `${text}\n${hashtags.join(' ')}` : text
  const length = countTextLength(platform, full)
  const problems: string[] = []
  if (length > c.textMax)
    problems.push(`Tekst ima ${length} karaktera, a ${c.label} dozvoljava ${c.textMax}.`)
  if (hashtags.length > c.hashtagsMax)
    problems.push(`${hashtags.length} hashtagova, a ${c.label} dozvoljava najviše ${c.hashtagsMax}.`)
  return { ok: problems.length === 0, length, max: c.textMax, hashtags: hashtags.length, problems }
}
