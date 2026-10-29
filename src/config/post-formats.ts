import type { SocialPlatform } from '@/config/platforms'

/**
 * Vrste objave (D-107): šta korisnik bira u Studiju i šta Autopilot meša. Svaka mreža prima samo
 * neke vrste (`PLATFORM_FORMATS`, isto što i `capabilities` providera); „AI bira” (`auto`) znači
 * da vrstu bira model ili Autopilot, među onima koje sve izabrane mreže primaju.
 */
export const POST_FORMATS = ['text', 'image', 'carousel', 'video', 'story', 'link'] as const
export type PostFormat = (typeof POST_FORMATS)[number]
export type PostFormatChoice = PostFormat | 'auto'

export const FORMAT_LABEL: Record<PostFormat, string> = {
  text: 'Samo tekst',
  image: 'Slika',
  carousel: 'Karusel',
  video: 'Video (Reels)',
  story: 'Priča (Story)',
  link: 'Link',
}

export const FORMAT_HINT: Record<PostFormat, string> = {
  text: 'Objava bez slike, za Facebook, LinkedIn i X.',
  image: 'Jedna fotografija ili vizual sa tekstom ispod.',
  carousel: 'Više fotografija u jednoj objavi, prevlače se.',
  video: 'Kratak vertikalan video sa opisom.',
  story: 'Vertikalna slika ili video koji traje 24 sata, bez opisa.',
  link: 'Tekst sa linkom i pregledom stranice.',
}

/** Vrste koje mreža prima, redom kojim se nude. */
export const PLATFORM_FORMATS: Record<SocialPlatform, readonly PostFormat[]> = {
  facebook: ['text', 'image', 'carousel', 'video', 'story', 'link'],
  instagram: ['image', 'carousel', 'video', 'story'],
  linkedin: ['text', 'image', 'carousel', 'video', 'link'],
  tiktok: ['video', 'carousel'],
  x: ['text', 'image', 'carousel', 'video', 'link'],
  youtube: ['video'],
  pinterest: ['image', 'video'],
  google_business: ['text', 'image', 'link'],
}

/** Vrste koje primaju sve izabrane mreže; bez mreža sve vrste. */
export function formatsForPlatforms(platforms: readonly SocialPlatform[]): PostFormat[] {
  if (!platforms.length) return [...POST_FORMATS]
  return POST_FORMATS.filter((f) => platforms.every((p) => PLATFORM_FORMATS[p].includes(f)))
}

/**
 * Vrsta za jednu mrežu kad izabrana tu ne prolazi: priča i karusel postaju slika, tekst i link
 * postaju slika na mrežama koje traže vizual, a video ostaje video ako ga mreža prima.
 */
export function formatFor(format: PostFormat, platform: SocialPlatform): PostFormat {
  const allowed = PLATFORM_FORMATS[platform]
  if (allowed.includes(format)) return format
  if (format === 'link' && allowed.includes('text')) return 'text'
  if (format === 'story' && allowed.includes('video') && !allowed.includes('image')) return 'video'
  if (allowed.includes('image')) return 'image'
  return allowed[0]!
}

export type MediaNeed =
  | { kind: 'none' }
  | { kind: 'image'; count: number; orientation: 'square' | 'portrait' }
  | { kind: 'video'; orientation: 'portrait' }

/** Kakav vizual traži vrsta: karusel tri fotografije, priča i video vertikalno. */
export function mediaNeed(format: PostFormat): MediaNeed {
  if (format === 'text' || format === 'link') return { kind: 'none' }
  if (format === 'video') return { kind: 'video', orientation: 'portrait' }
  if (format === 'carousel') return { kind: 'image', count: 3, orientation: 'square' }
  if (format === 'story') return { kind: 'image', count: 1, orientation: 'portrait' }
  return { kind: 'image', count: 1, orientation: 'square' }
}

/**
 * Raspored vrsta kad AI meša (Autopilot): kroz nedelju se smenjuju dozvoljene vrste, a slika i
 * karusel dolaze češće od videa i priče jer se lakše prave i rade na više mreža.
 */
export function mixedFormat(allowed: readonly PostFormat[], index: number): PostFormat | null {
  if (!allowed.length) return null
  const weighted = allowed.flatMap((f) => (f === 'image' || f === 'carousel' ? [f, f] : [f]))
  return weighted[index % weighted.length]!
}
