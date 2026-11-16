/**
 * Glavni predmet fotografije (D-167): provera fotografija kaže gde je on na slici, pa se fotografija
 * iseca oko njega (kvadrat za objavu, 9:16 za priču), a u okviru stila se pomera tako da predmet ostane
 * u kadru. Bez fokusa sve ide kao ranije, po sredini.
 */
export interface Focus {
  /** 0 levo, 1 desno */
  x: number
  /** 0 gore, 1 dole */
  y: number
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Fokus iz baze ili iz odgovora modela; neispravan je `null`. */
export function parseFocus(value: unknown): Focus | null {
  if (!value || typeof value !== 'object') return null
  const { x, y } = value as { x?: unknown; y?: unknown }
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y))
    return null
  return { x: clamp01(x), y: clamp01(y) }
}

export interface FocusCropRect {
  left: number
  top: number
  width: number
  height: number
  /** fokus unutar isečka */
  focus: Focus
}

/**
 * Isečak razmere `aspect` (širina / visina) iz slike `width` × `height`: najveći koji staje, sa fokusom
 * što bliže sredini, a da ne izađe van slike. Fokus uz ivicu ostaje uz ivicu, ali u isečku.
 */
export function focusCrop(width: number, height: number, aspect: number, focus: Focus): FocusCropRect {
  let w = width
  let h = Math.round(width / aspect)
  if (h > height) {
    h = height
    w = Math.min(width, Math.round(height * aspect))
  }
  const fx = clamp01(focus.x) * width
  const fy = clamp01(focus.y) * height
  const left = Math.round(Math.min(width - w, Math.max(0, fx - w / 2)))
  const top = Math.round(Math.min(height - h, Math.max(0, fy - h / 2)))
  return {
    left,
    top,
    width: w,
    height: h,
    focus: { x: clamp01((fx - left) / w), y: clamp01((fy - top) / h) },
  }
}

const pct = (n: number) => `${Math.round(clamp01(n) * 1000) / 10}%`

/** CSS `object-position` za fotografiju u okviru stila: tačka fokusa ostaje u kadru. */
export function objectPosition(focus: Focus): string {
  return `${pct(focus.x)} ${pct(focus.y)}`
}

/** Okvir glavnog predmeta na slici (D-169), od 0 do 1 po širini i visini. */
export interface SubjectBox {
  left: number
  top: number
  right: number
  bottom: number
}

/** Okvir predmeta iz baze; neispravan je `null`. */
export function parseBox(value: unknown): SubjectBox | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const n = [v.left, v.top, v.right, v.bottom].map((x) =>
    typeof x === 'number' && Number.isFinite(x) ? x : null,
  )
  if (n.some((x) => x === null)) return null
  const [left, top, right, bottom] = (n as number[]).map(clamp01) as [number, number, number, number]
  return right > left && bottom > top ? { left, top, right, bottom } : null
}

export const boxCenter = (box: SubjectBox): Focus => ({
  x: (box.left + box.right) / 2,
  y: (box.top + box.bottom) / 2,
})

export type PhotoOrientation = 'landscape' | 'portrait' | 'squarish'

/** Oblik fotografije za okvir razmere `aspect` (širina / visina): vodoravna, uspravna ili kvadratna. */
export function orientationOf(aspect: number): PhotoOrientation {
  if (aspect >= 1.2) return 'landscape'
  if (aspect <= 0.83) return 'portrait'
  return 'squarish'
}

/**
 * Može li ceo predmet da stane u okvir razmere `aspect` isečen iz slike `width` × `height`
 * (najveći takav isečak), uz malu toleranciju za vrh repa ili uha.
 */
export function subjectFits(
  image: { width: number; height: number },
  box: SubjectBox,
  aspect: number,
  tolerance = 1.06,
): boolean {
  const imageAspect = image.width / image.height
  const cropW = imageAspect >= aspect ? image.height * aspect : image.width
  const cropH = imageAspect >= aspect ? image.height : image.width / aspect
  const boxW = (box.right - box.left) * image.width
  const boxH = (box.bottom - box.top) * image.height
  return boxW <= cropW * tolerance && boxH <= cropH * tolerance
}

/**
 * `object-position` za sliku razmere `imageAspect` u okviru razmere `slotAspect` (`objectFit: cover`):
 * tačka fokusa dolazi što bliže sredini okvira, a da isečak ne izađe van slike. Za razliku od
 * `objectPosition`, koji samo drži tačku u kadru, ovo predmet zaista centrira.
 */
export function centeredPosition(
  focus: Focus,
  imageAspect: number,
  slotAspect: number,
  box?: SubjectBox | null,
): string {
  if (imageAspect >= slotAspect) {
    // vidi se puna visina, seče se širina
    const visible = slotAspect / imageAspect
    const x = visible >= 1 ? 0.5 : (clamp01(focus.x) - visible / 2) / (1 - visible)
    return `${pct(x)} 50%`
  }
  const visible = imageAspect / slotAspect
  if (visible >= 1) return '50% 50%'
  // predmet viši od okvira (D-169): okvir ide od vrha predmeta, pa se seče dole, a glava ostaje
  if (box && box.bottom - box.top > visible) return `50% ${pct((box.top - 0.02) / (1 - visible))}`
  return `50% ${pct((clamp01(focus.y) - visible / 2) / (1 - visible))}`
}
