import { splitXThread } from '@/lib/x-text'

/**
 * Podešavanja objave na X-u po targetu (`post_targets.options.x`, D-150): tekst duži od 280 znakova
 * ide kao nit (uključeno dok ga korisnik ne isključi) i delovi dobijaju „1/5”. Sme u klijentski kod.
 */
export interface XOptions {
  thread: boolean
  numbered: boolean
}

export function readXOptions(options: Record<string, unknown> | null | undefined): XOptions {
  const o = (options?.x ?? {}) as Record<string, unknown>
  return { thread: o.thread !== false, numbered: o.numbered !== false }
}

/** Objave koje idu na X: nit kad je uključena, inače ceo tekst u jednoj objavi. */
export function xThreadParts(text: string, o: XOptions): string[] {
  if (o.thread) return splitXThread(text, { numbered: o.numbered })
  const clean = text.trim()
  return clean ? [clean] : []
}
