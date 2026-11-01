/**
 * Senke iz Satori-ja su skupe za resvg: za svaku senku (`boxShadow`) Satori pravi filter sa
 * zamućenjem čija je oblast i dva do tri puta veća od slajda, a resvg zamućuje celu tu površinu.
 * Nalepnica u priči se zato crtala 3,5 s umesto 0,5 s, pa sloj za video nije stajao u 30 s.
 * Oblast filtera se svodi na senku i tri standardne devijacije zamućenja oko nje, u granicama
 * slajda; dalje od toga senka je nevidljiva, pa slika izgleda isto.
 */

const attr = (tag: string, name: string): number | null => {
  const m = tag.match(new RegExp(`\\s${name}="(-?[\\d.]+)"`))
  return m ? Number(m[1]) : null
}

/** Granice oblika senke posle `transform="matrix(…)"` (nagnuta kartica ima širi okvir). */
function bounds(tag: string): [number, number, number, number] | null {
  const x = attr(tag, 'x')
  const y = attr(tag, 'y')
  const w = attr(tag, 'width')
  const h = attr(tag, 'height')
  if (x === null || y === null || w === null || h === null) return null
  let corners: Array<[number, number]> = [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ]
  const transform = tag.match(/\stransform="([^"]*)"/)
  if (transform) {
    const m = transform[1]!.match(/^matrix\(([^)]*)\)$/)
    if (!m) return null
    const [a, b, c, d, e, f] = m[1]!.split(/[\s,]+/).map(Number)
    if ([a, b, c, d, e, f].some((v) => v === undefined || !Number.isFinite(v))) return null
    corners = corners.map(([px, py]) => [a! * px + c! * py + e!, b! * px + d! * py + f!])
  }
  const xs = corners.map((p) => p[0])
  const ys = corners.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/**
 * Sužava oblast filtera senki u SVG-u iz Satori-ja na stvarnu senku. Filter koji nije senka
 * pravougaonika ili oblika sa poznatim granicama (npr. senka teksta) ostaje kakav jeste.
 */
export function tightenShadowFilters(svg: string, width: number, height: number): string {
  return svg.replace(
    /<filter id="([^"]+)" x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*">(<feGaussianBlur stdDeviation="([\d.]+)")/g,
    (whole, id: string, blur: string, deviation: string) => {
      const at = svg.indexOf(`filter="url(#${id})"`)
      if (at < 0) return whole
      // oblik senke je prvi element u grupi sa filterom
      const open = svg.indexOf('>', at)
      const end = svg.indexOf('>', open + 1)
      if (open < 0 || end < 0) return whole
      const shape = svg.slice(open + 1, end + 1)
      if (!/^<(rect|path)\s/.test(shape)) return whole
      const box = bounds(shape)
      if (!box) return whole
      const margin = 3 * Number(deviation) + 2
      const x0 = Math.max(0, Math.floor(box[0] - margin))
      const y0 = Math.max(0, Math.floor(box[1] - margin))
      const x1 = Math.min(width, Math.ceil(box[2] + margin))
      const y1 = Math.min(height, Math.ceil(box[3] + margin))
      if (x1 <= x0 || y1 <= y0) return whole
      return `<filter id="${id}" filterUnits="userSpaceOnUse" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}">${blur}`
    },
  )
}
