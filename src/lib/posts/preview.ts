import type { SocialPlatform } from '@/config/platforms'

/**
 * Pregled objave na mreži (D-138): koliko teksta mreža pokazuje pre „više”, gde se objava vidi (feed,
 * priča, vertikalni video) i u kojoj razmeri. Pravila su približna, po izgledu aplikacija na telefonu
 * (novembar 2026): pregled pokazuje prvi utisak, ne garantuje piksel.
 */
export interface CaptionRule {
  /** znakova pre „više” */
  chars: number
  /** redova pre „više” */
  lines: number
}

export const CAPTION_RULES: Record<SocialPlatform, CaptionRule> = {
  instagram: { chars: 125, lines: 2 },
  facebook: { chars: 250, lines: 5 },
  linkedin: { chars: 210, lines: 3 },
  tiktok: { chars: 80, lines: 2 },
  x: { chars: 280, lines: 40 },
  youtube: { chars: 100, lines: 2 },
  pinterest: { chars: 100, lines: 2 },
  google_business: { chars: 150, lines: 3 },
}

/** Tekst pre „više”: do prvog ograničenja (redovi ili znakovi), bez reči i emodžija presečenih na pola. */
export function clipCaption(text: string, rule: CaptionRule): { shown: string; cut: boolean } {
  const full = text.trim()
  let shown = full.split('\n').slice(0, rule.lines).join('\n')
  const chars = Array.from(shown)
  if (chars.length > rule.chars) {
    shown = chars.slice(0, rule.chars).join('')
    const space = shown.lastIndexOf(' ')
    if (space > shown.length * 0.6) shown = shown.slice(0, space)
  }
  shown = shown.trimEnd()
  return { shown, cut: shown.length < full.length }
}

export interface CaptionPart {
  kind: 'text' | 'tag' | 'mention' | 'link'
  value: string
}

// hešteg i pominjanje samo posle razmaka ili na početku (ne „C#” ni adresa e-pošte), link bez tačke na kraju
const TOKEN =
  /((?<![\p{L}\p{N}_&])#[\p{L}\p{N}_]+|(?<![\p{L}\p{N}_])@[\p{L}\p{N}_.]*[\p{L}\p{N}_]|https?:\/\/[^\s]*[^\s.,;:!?)\]}"'»])/u

/** Tekst podeljen na obične delove, heštegove, pominjanja i linkove, koje mreža boji. */
export function captionParts(text: string): CaptionPart[] {
  return text
    .split(TOKEN)
    .map((value, i): CaptionPart => {
      if (i % 2 === 0) return { kind: 'text', value }
      return { kind: value.startsWith('#') ? 'tag' : value.startsWith('@') ? 'mention' : 'link', value }
    })
    .filter((p) => p.value)
}

export type Placement = 'feed' | 'story' | 'vertical'

export interface PreviewMediaShape {
  video: boolean
  width: number | null
  height: number | null
}

/**
 * Gde se objava vidi: priča (izabrana u podešavanjima mreže), vertikalni video preko celog ekrana
 * (Reel na Instagramu, TikTok, YouTube Shorts) ili feed.
 */
export function placementOf(
  platform: SocialPlatform,
  options: Record<string, unknown> | null | undefined,
  media: PreviewMediaShape[],
): Placement {
  if (options?.format === 'story' && (platform === 'instagram' || platform === 'facebook')) return 'story'
  if (!media.length) return 'feed'
  if (platform === 'tiktok') return 'vertical'
  const video = media.length === 1 && media[0]!.video
  if (video && (platform === 'instagram' || platform === 'youtube')) return 'vertical'
  return 'feed'
}

/** Razmera slike u feedu (širina / visina), u granicama koje mreža prikazuje bez sečenja. */
export function feedRatio(platform: SocialPlatform, media: PreviewMediaShape | undefined): number {
  if (platform === 'google_business') return 4 / 3
  const ratio = media?.width && media.height ? media.width / media.height : 0.8
  const [min, max] = platform === 'pinterest' ? [0.5, 1.5] : platform === 'x' ? [0.75, 1.91] : [0.8, 1.91]
  return Math.min(max, Math.max(min, ratio))
}
