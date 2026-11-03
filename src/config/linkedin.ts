/**
 * Podešavanja LinkedIn objave po targetu (`post_targets.options.linkedin`, D-149): kako ide objava sa
 * više slika. PDF dokument se prevlači strana po strana i na LinkedIn-u radi bolje od mreže slika za
 * slajdove; fotografije (događaj, tim) bolje izgledaju kao mreža. Bez izbora odlučuje poreklo slika:
 * slajdovi koje je nacrtala Sova idu kao dokument, ostalo kao mreža.
 */
export const LINKEDIN_CAROUSEL_MODES = ['auto', 'document', 'images'] as const
export type LinkedInCarouselMode = (typeof LINKEDIN_CAROUSEL_MODES)[number]

export interface LinkedInOptions {
  carousel: LinkedInCarouselMode
  /** naslov iznad dokumenta; prazno = naslov objave ili prvi red teksta */
  documentTitle: string | null
}

/** LinkedIn prima dokument do 300 strana i 100 MB. */
export const LINKEDIN_DOCUMENT_MAX_PAGES = 300
export const LINKEDIN_DOCUMENT_TITLE_MAX = 200

export function readLinkedInOptions(options: Record<string, unknown> | null | undefined): LinkedInOptions {
  const o = (options?.linkedin ?? {}) as Record<string, unknown>
  const mode = LINKEDIN_CAROUSEL_MODES.includes(o.carousel as LinkedInCarouselMode)
    ? (o.carousel as LinkedInCarouselMode)
    : 'auto'
  const title = typeof o.documentTitle === 'string' && o.documentTitle.trim() ? o.documentTitle.trim() : null
  return { carousel: mode, documentTitle: title ? title.slice(0, LINKEDIN_DOCUMENT_TITLE_MAX) : null }
}

/** Dokument za dve i više slika: izbor korisnika, inače slajdovi Sove. */
export function linkedinAsDocument(o: LinkedInOptions, images: number, designedSlides: boolean): boolean {
  if (images < 2) return false
  return o.carousel === 'document' || (o.carousel === 'auto' && designedSlides)
}

/** Naslov dokumenta: iz podešavanja, pa naslov objave, pa prvi red teksta. */
export function linkedinDocumentTitle(
  o: LinkedInOptions,
  postTitle: string | null | undefined,
  text: string,
): string {
  const first =
    text
      .split('\n')
      .find((l) => l.trim())
      ?.trim() ?? ''
  // prazan naslov objave ne zaustavlja izbor: ide prvi red teksta
  return (o.documentTitle || postTitle?.trim() || first || 'Dokument').slice(0, LINKEDIN_DOCUMENT_TITLE_MAX)
}
