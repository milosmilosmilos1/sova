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

/** CSS `object-position` za fotografiju u okviru stila: tačka fokusa ostaje u kadru. */
export function objectPosition(focus: Focus): string {
  const pct = (n: number) => `${Math.round(clamp01(n) * 1000) / 10}%`
  return `${pct(focus.x)} ${pct(focus.y)}`
}
