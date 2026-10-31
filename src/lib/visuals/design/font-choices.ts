/**
 * Fontovi koje korisnik bira za svoj izgled (D-123): Google fontovi sa latinicom i ćirilicom, jer se
 * objave pišu i na srpskoj ćirilici i ukrajinskom. Svaki dobro radi i za naslov i za tekst slajda.
 * Sme u klijentski kod (birač).
 */
export const LOOK_FONTS = [
  'Inter',
  'Montserrat',
  'Manrope',
  'Rubik',
  'Nunito',
  'Open Sans',
  'Raleway',
  'Exo 2',
  'Unbounded',
  'Playfair Display',
  'Lora',
  'Merriweather',
  'PT Serif',
  'Cormorant Garamond',
  'Oswald',
] as const

/** Ime fonta koje sme u URL Google Fonts-a i u `brands.design`. */
export const FONT_NAME = /^[A-Za-z0-9][A-Za-z0-9 ]{1,39}$/

/**
 * Prosečna širina slova u odnosu na veličinu fonta (mešana mala i velika slova). Stil koji je
 * veličinu naslova podesio za svoj font (npr. uski Oswald) prilagođava je kad font brenda zameni
 * njegov, da naslov ne izađe iz okvira. Nepoznat font se računa kao prosečan.
 */
const WIDTH: Record<string, number> = {
  inter: 0.56,
  roboto: 0.54,
  'open sans': 0.56,
  montserrat: 0.62,
  manrope: 0.58,
  rubik: 0.57,
  nunito: 0.55,
  'nunito sans': 0.55,
  raleway: 0.57,
  'exo 2': 0.56,
  unbounded: 0.7,
  poppins: 0.62,
  lato: 0.53,
  'pt sans': 0.52,
  ubuntu: 0.55,
  'fira sans': 0.55,
  'work sans': 0.58,
  'dm sans': 0.56,
  'space grotesk': 0.58,
  'plus jakarta sans': 0.58,
  outfit: 0.55,
  sora: 0.62,
  urbanist: 0.55,
  lexend: 0.6,
  'playfair display': 0.52,
  lora: 0.53,
  merriweather: 0.6,
  'pt serif': 0.54,
  'cormorant garamond': 0.45,
  'eb garamond': 0.47,
  'libre baskerville': 0.6,
  'dm serif display': 0.5,
  oswald: 0.46,
  'bebas neue': 0.4,
  anton: 0.45,
  caveat: 0.42,
  'jetbrains mono': 0.6,
}

export function fontWidth(name: string): number {
  return WIDTH[name.trim().toLowerCase()] ?? 0.57
}
