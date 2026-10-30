/**
 * Izbor fotografije iz galerije (D-114): reči iz teme i upita za vizual porede se sa opisom,
 * kategorijom i tagovima fotografije. Među jednako dobrim prednost ima ona koja najduže nije
 * korišćena, pa se iste fotografije ne ponavljaju iz objave u objavu.
 */

/** U galeriji su fotografije koje je brend sam dodao: otpremljene i iz Canve (bez slajdova i stoka). */
export const GALLERY_SOURCES = ['upload', 'canva'] as const

export interface GalleryCandidate {
  id: string
  description: string | null
  altText: string | null
  tags: string[]
  categoryName: string | null
  lastUsedAt: string | null
  createdAt: string
}

/** česte reči bez značenja za izbor fotografije (engleski upit za vizual i srpski tekst) */
const STOP = new Set(
  'the and for with your you how why what from this that kako zašto zasto koji koja koje šta sta ili ali kad kada ste smo vaš vas vaše vase naš nas naše nase pre posle bez ovo taj'.split(
    ' ',
  ),
)

/** Reči za poređenje: mala slova, bez kratkih i čestih reči; „klime” i „klima” se poklapaju po korenu. */
export function galleryWords(...texts: Array<string | null | undefined>): string[] {
  const out = new Set<string>()
  for (const text of texts) {
    for (const raw of (text ?? '').toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (raw.length < 3 || STOP.has(raw)) continue
      out.add(raw)
    }
  }
  return [...out]
}

/** Koren za grubo poklapanje oblika reči (padeži, množina): „klima” i „klimu” → „klim”, „servisiranje” → „servi”. */
function stem(word: string): string {
  return word.length >= 5 ? word.slice(0, Math.min(5, word.length - 1)) : word
}

export function galleryScore(photo: GalleryCandidate, words: string[]): number {
  if (!words.length) return 0
  const hay = galleryWords(photo.description, photo.altText, photo.categoryName, photo.tags.join(' '))
  const stems = new Set(hay.map(stem))
  const exact = new Set(hay)
  let score = 0
  for (const w of words) {
    if (exact.has(w)) score += 2
    else if (stems.has(stem(w))) score += 1
  }
  return score
}

/** Najbolje fotografije za temu; neopisane i dugo nekorišćene ne ostaju zauvek na dnu. */
export function rankGalleryPhotos<T extends GalleryCandidate>(photos: T[], words: string[]): T[] {
  const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0)
  return photos
    .map((p) => ({ p, s: galleryScore(p, words) }))
    .sort(
      (a, b) =>
        b.s - a.s || time(a.p.lastUsedAt) - time(b.p.lastUsedAt) || time(b.p.createdAt) - time(a.p.createdAt),
    )
    .map((x) => x.p)
}
