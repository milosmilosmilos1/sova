/**
 * Link Figma fajla (D-161): `figma.com/design/<ključ>/<ime>?node-id=12-34` (i stari `/file/`,
 * prototip `/proto/`). Grana fajla ima svoj ključ (`/design/<ključ>/branch/<ključ grane>`), a API
 * traži ključ grane. `node-id` u adresi piše „12-34”, a API „12:34”.
 */
const LINK =
  /^https:\/\/(?:www\.)?figma\.com\/(?:file|design|proto)\/([A-Za-z0-9]{10,64})(?:\/branch\/([A-Za-z0-9]{10,64}))?(?:[/?#]|$)/

export interface FigmaLink {
  fileKey: string
  nodeId: string | null
}

export function parseFigmaLink(input: string): FigmaLink | null {
  const value = input.trim()
  const match = LINK.exec(value)
  if (!match) return null
  let nodeId: string | null = null
  try {
    const raw = new URL(value).searchParams.get('node-id')
    if (raw && /^\d+[-:]\d+$/.test(raw)) nodeId = raw.replace('-', ':')
  } catch {
    // neispravan URL je već odbijen iznad
  }
  return { fileKey: match[2] ?? match[1]!, nodeId }
}
