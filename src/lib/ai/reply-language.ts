import type { AppLocale } from '@/i18n/config'

/**
 * Jezik razgovora sa Sovom (D-156). Odgovor ide na jeziku aplikacije korisnika, a na jeziku poruke
 * samo kad je poruka cela rečenica koja se jasno prepoznaje. Model ume da sklizne u jezik brenda ili
 * u srodan jezik, pa Studio posle odgovora proverava pismo i slova i po potrebi prevodi odgovor.
 */

const CYRILLIC = /\p{Script=Cyrillic}/gu
const LETTERS = /\p{L}/gu
/** slova kojih nema u srpskoj ćirilici */
const UKRAINIAN = /[іїєґІЇЄҐ]/u
/** slova kojih nema u ukrajinskom */
const SERBIAN_CYRILLIC = /[ђћљњџјЂЋЉЊЏЈ]/u
const SERBIAN_LATIN = /[čćžšđČĆŽŠĐ]/u
/** česte srpske reči koje se ne javljaju u engleskom tekstu */
const SERBIAN_WORDS = /\b(je|sam|ću|ćete|da|za|sa|na|objav\w*|pravim|priču|karusel\w*|slajd\w*|vaš\w*)\b/iu

function cyrillicShare(text: string): number {
  const letters = text.match(LETTERS)?.length ?? 0
  if (!letters) return 0
  return (text.match(CYRILLIC)?.length ?? 0) / letters
}

/** Jezik razgovora: poruka od bar tri reči koja se jasno prepoznaje, inače jezik aplikacije. */
export function conversationLocale(message: string, uiLocale: AppLocale): AppLocale {
  const words = message.trim().split(/\s+/).filter(Boolean)
  if (words.length < 3) return uiLocale
  if (cyrillicShare(message) > 0.6) {
    if (SERBIAN_CYRILLIC.test(message)) return 'sr-Latn'
    if (UKRAINIAN.test(message)) return 'uk'
    return uiLocale
  }
  if (SERBIAN_LATIN.test(message)) return 'sr-Latn'
  return uiLocale
}

/** Da li je tekst na traženom jeziku; prazan tekst prolazi. */
export function isInLocale(text: string, locale: AppLocale): boolean {
  if (!(text.match(LETTERS)?.length ?? 0)) return true
  const share = cyrillicShare(text)
  if (locale === 'uk') return share > 0.6 && !SERBIAN_CYRILLIC.test(text)
  if (locale === 'en') return share < 0.2 && !SERBIAN_LATIN.test(text) && !SERBIAN_WORDS.test(text)
  return share < 0.4
}

export const LOCALE_TARGET: Record<AppLocale, string> = {
  'sr-Latn': 'srpski jezik, latinica',
  en: 'engleski jezik',
  uk: 'ukrajinski jezik (українська мова), ćirilica',
}
