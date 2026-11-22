/**
 * Unsplash fotografija u prikazu (D-190): Sova je prikazuje sa Unsplash adrese (hotlink), a kopija u
 * našem skladištu služi samo za objavu na mreži. Uz svaku prikazanu fotografiju stoje autor i Unsplash
 * sa linkovima. Bez `server-only`: koriste ga i server (adrese) i komponente (potpis).
 */

export interface PhotoCredit {
  name: string
  /** profil autora na Unsplash-u, sa utm parametrima */
  photographerUrl: string
  /** naslovna Unsplash-a, sa utm parametrima */
  unsplashUrl: string
}

const UNSPLASH_PAGE = /^https:\/\/unsplash\.com\//
const UNSPLASH_CDN = /^https:\/\/images\.unsplash\.com\//

/**
 * Potpis iz sačuvane atribucije (`media_assets.attribution`): Unsplash fotografija i šablon koji ju je
 * upotrebio čuvaju ime autora i oba linka. Linkovi moraju voditi na unsplash.com, inače nema potpisa.
 */
export function photoCreditOf(attribution: unknown): PhotoCredit | null {
  if (!attribution || typeof attribution !== 'object') return null
  const a = attribution as Record<string, unknown>
  const name = typeof a.photographerName === 'string' ? a.photographerName.trim() : ''
  const photographerUrl = typeof a.photographerUrl === 'string' ? a.photographerUrl : ''
  const unsplashUrl = typeof a.unsplashUrl === 'string' ? a.unsplashUrl : ''
  if (!name || !UNSPLASH_PAGE.test(photographerUrl) || !UNSPLASH_PAGE.test(unsplashUrl)) return null
  return { name, photographerUrl, unsplashUrl }
}

interface StoredUnsplashData {
  urls?: { raw?: unknown; regular?: unknown }
  crop?: unknown
}

interface UserCrop {
  left: number
  top: number
  width: number
  height: number
  sourceWidth: number
  sourceHeight: number
  fromFull: boolean
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const round3 = (n: number) => Math.round(clamp01(n) * 1000) / 1000

/** Isečak iz editora (`cropImage`): pravougaonik u pikselima izvora i veličina izvora. */
function userCrop(crop: unknown): UserCrop | null {
  if (!crop || typeof crop !== 'object') return null
  const c = crop as Record<string, unknown>
  const nums = ['left', 'top', 'width', 'height', 'sourceWidth', 'sourceHeight'].map((k) => Number(c[k]))
  if (nums.some((n) => !Number.isFinite(n) || n < 0) || !nums[4] || !nums[5]) return null
  const [left, top, width, height, sourceWidth, sourceHeight] = nums as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  return { left, top, width, height, sourceWidth, sourceHeight, fromFull: c.fromFull === true }
}

/**
 * Adresa za prikaz Unsplash fotografije iz biblioteke (hotlink na images.unsplash.com, `ixid` ostaje).
 * Isečak (kvadrat ili 9:16 iz ranijeg automatskog izbora, ili isečak iz editora) prikazuje se istim
 * kadrom: ista veličina, a isečak iz editora i isti centar kroz `crop=focalpoint`. Vraća null kad
 * fotografija nije sa Unsplash-a ili kad isečak ne može da se ponovi (pozivalac tada daje kopiju).
 */
export function unsplashDisplayUrl(
  sourceData: unknown,
  size: { width: number | null; height: number | null },
  maxWidth = 1080,
): string | null {
  const sd = (sourceData ?? {}) as StoredUnsplashData
  const base = [sd.urls?.raw, sd.urls?.regular].find(
    (u): u is string => typeof u === 'string' && UNSPLASH_CDN.test(u),
  )
  if (!base) return null
  // isečak oko predmeta (automatski izbor) ili isečak iz editora; ostalo je ceo kadar
  let focus: { x: number; y: number } | null = null
  let cropped = false
  if (sd.crop === 'square' || sd.crop === 'portrait') {
    // sačuvani fokus je unutar isečka, ne u celom kadru; isečak je bez fokusa centriran, kao ovde
    cropped = true
  } else if (sd.crop && sd.crop !== 'full') {
    const c = userCrop(sd.crop)
    // isečak isečka ili stari zapis bez veličine izvora: prikaz ide iz skladišta (pozivalac)
    if (!c || !c.fromFull) return null
    cropped = true
    focus = { x: (c.left + c.width / 2) / c.sourceWidth, y: (c.top + c.height / 2) / c.sourceHeight }
  }
  const u = new URL(base)
  const w = Math.min(maxWidth, size.width ?? maxWidth)
  u.searchParams.set('w', String(w))
  if (cropped && size.width && size.height) {
    u.searchParams.set('h', String(Math.round((w * size.height) / size.width)))
    u.searchParams.set('fit', 'crop')
    if (focus) {
      u.searchParams.set('crop', 'focalpoint')
      u.searchParams.set('fp-x', String(round3(focus.x)))
      u.searchParams.set('fp-y', String(round3(focus.y)))
    }
  } else {
    u.searchParams.set('fit', 'max')
  }
  u.searchParams.set('q', '80')
  u.searchParams.set('auto', 'format')
  return u.toString()
}
