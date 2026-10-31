/**
 * Sloj teksta za video u temi (D-128): slajd se nacrta dvaput, sa crnom i sa belom fotografijom.
 * Razlika dve slike je koliko se fotografija vidi kroz sloj, pa se iz nje dobija providnost, a iz
 * slike sa crnom boja sloja. Važi za svaki stil teme, i za prelive i ivice slova preko fotografije,
 * pa video izgleda kao slajd iste teme sa snimkom umesto fotografije.
 *
 * Ulaz su RGBA pikseli iste veličine; izlaz je RGBA sa providnošću (boja nije pomnožena alfom).
 */
export function matteFromKeys(onBlack: Uint8Array, onWhite: Uint8Array): Uint8Array {
  if (onBlack.length !== onWhite.length) throw new Error('Slike za sloj nisu iste veličine.')
  const out = new Uint8Array(onBlack.length)
  for (let i = 0; i < onBlack.length; i += 4) {
    const through =
      (onWhite[i]! - onBlack[i]! + onWhite[i + 1]! - onBlack[i + 1]! + onWhite[i + 2]! - onBlack[i + 2]!) /
      765
    const alpha = Math.min(1, Math.max(0, 1 - through))
    out[i + 3] = Math.round(alpha * 255)
    if (out[i + 3] === 0) continue
    out[i] = Math.min(255, Math.round(onBlack[i]! / alpha))
    out[i + 1] = Math.min(255, Math.round(onBlack[i + 1]! / alpha))
    out[i + 2] = Math.min(255, Math.round(onBlack[i + 2]! / alpha))
  }
  return out
}
