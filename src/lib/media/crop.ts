/**
 * Odnos stranica slike prema mrežama (EDGE_CASES N9). Deli se između editora (upozorenje i pregled
 * isečka) i servera (sečenje), pa pregled i rezultat imaju isti pravougaonik.
 */
export interface AspectRange {
  min: number
  max: number
}

/** Tolerancija pri proveri, ista kao u proveri objave po mreži. */
export const ASPECT_TOLERANCE = 0.01

export function aspectFits(ratio: number, range: AspectRange): boolean {
  return ratio >= range.min - ASPECT_TOLERANCE && ratio <= range.max + ASPECT_TOLERANCE
}

/** Presek opsega izabranih mreža; `null` kad nijedan odnos ne odgovara svima. */
export function commonAspectRange(ranges: AspectRange[]): AspectRange | null {
  if (!ranges.length) return null
  const min = Math.max(...ranges.map((r) => r.min))
  const max = Math.min(...ranges.map((r) => r.max))
  return min <= max ? { min, max } : null
}

/** Najbliži dozvoljen odnos: sečenje uzima što manje slike. */
export function cropTarget(ratio: number, range: AspectRange): number {
  return Math.min(range.max, Math.max(range.min, ratio))
}

/** Najveći isečak sa odnosom `aspect` (širina/visina); `position` 0–1 ga pomera po osi koja se seče. */
export function cropRect(
  width: number,
  height: number,
  aspect: number,
  position = 0.5,
): { left: number; top: number; width: number; height: number } {
  const p = Math.min(1, Math.max(0, position))
  if (width / height > aspect) {
    const w = Math.max(1, Math.min(width, Math.round(height * aspect)))
    return { left: Math.round((width - w) * p), top: 0, width: w, height }
  }
  const h = Math.max(1, Math.min(height, Math.round(width / aspect)))
  return { left: 0, top: Math.round((height - h) * p), width, height: h }
}

const NAMED: Array<[number, string]> = [
  [1, '1:1'],
  [0.8, '4:5'],
  [0.75, '3:4'],
  [4 / 3, '4:3'],
  [1.91, '1,91:1'],
  [16 / 9, '16:9'],
  [9 / 16, '9:16'],
  [2, '2:1'],
  [0.5, '1:2'],
  [3, '3:1'],
  [1 / 3, '1:3'],
]

/** Natpis odnosa za korisnika: poznati formati imenom (4:5), ostali decimalno (1,25:1). */
export function aspectLabel(ratio: number): string {
  const named = NAMED.find(([r]) => Math.abs(r - ratio) < ASPECT_TOLERANCE)
  return named ? named[1] : `${ratio.toFixed(2).replace('.', ',')}:1`
}
