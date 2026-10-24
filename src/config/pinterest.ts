/**
 * Podešavanja pina po targetu (`post_targets.options.pinterest`): tabla (obavezna, bira je korisnik za
 * svaki pin, D-085) i naslov pina. Opis je tekst objave (do 800 znakova), link je link objave.
 */
export interface PinterestOptions {
  boardId: string | null
  /** samo za prikaz u editoru */
  boardName: string | null
  /** prazno = naslov objave ili prvi red teksta */
  title: string | null
}

export const PINTEREST_VIDEO_MIN_MS = 4_000
export const PINTEREST_VIDEO_MAX_MS = 15 * 60_000

export function readPinterestOptions(options: Record<string, unknown> | null | undefined): PinterestOptions {
  const o = (options?.pinterest ?? {}) as Record<string, unknown>
  const s = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  return { boardId: s(o.boardId, 40), boardName: s(o.boardName, 180), title: s(o.title, 100) }
}

export function pinterestTitle(
  o: PinterestOptions,
  postTitle: string | null | undefined,
  text: string,
): string {
  return (o.title ?? postTitle?.trim() ?? text.split('\n')[0]?.trim() ?? '').slice(0, 100)
}

export function pinterestOptionProblems(o: PinterestOptions): string[] {
  return o.boardId ? [] : ['Izaberite Pinterest tablu za ovaj pin.']
}
