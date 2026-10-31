/**
 * Raspored teškog posla nad slajdovima (D-122). Pozadinski posao na Netlify-u dobija 30 sekundi po
 * zahtevu, pa plan i tokovi crtaju slajdove u delovima, svaki deo u svom koraku. Raspored
 * fotografija se računa unapred, da bude isti u svakom delu i pri ponovljenom koraku.
 */

/** Najviše toliko slajdova po koraku: slajd sa fotografijom na Netlify-u traje oko dve sekunde. */
export const SLIDES_PER_STEP = 3

/** Delovi [od, do) od najviše `size` slajdova, redom. */
export function slideRanges(total: number, size = SLIDES_PER_STEP): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let from = 0; from < total; from += size) out.push([from, Math.min(total, from + size)])
  return out
}

/**
 * Koja fotografija ide na koji slajd: svaki slajd koji crta fotografiju dobija sledeću (D-121).
 * Izabrane fotografije se u objavi ne ponavljaju, pa slajd posle poslednje ostaje u bojama;
 * fotografije koje je dao korisnik idu ukrug (`cycle`), jer je to njegov izbor.
 */
export function photoOrder(needs: boolean[], photos: number, cycle: boolean): Array<number | null> {
  let next = 0
  return needs.map((need) => {
    if (!need || photos === 0 || (!cycle && next >= photos)) return null
    return next++ % photos
  })
}
