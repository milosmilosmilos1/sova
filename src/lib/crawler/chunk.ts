/** Deljenje teksta na chunkove za embeddinge (brif 5.4): po pasusima, oko 3.000 karaktera, preklop 300. */
export interface Chunk {
  index: number
  content: string
  tokenEstimate: number
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function chunkText(
  text: string,
  options: { size?: number; overlap?: number; max?: number } = {},
): Chunk[] {
  const size = options.size ?? 3000
  const overlap = options.overlap ?? 300
  const max = options.max ?? 200
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  const chunks: Chunk[] = []
  let current = ''
  const push = () => {
    const content = current.trim()
    if (content.length >= 40)
      chunks.push({ index: chunks.length, content, tokenEstimate: estimateTokens(content) })
  }
  for (const p of paragraphs) {
    if (p.length > size) {
      // predugačak pasus: seci po rečenicama
      const sentences = p.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [p]
      for (const s of sentences) {
        if (current.length + s.length > size && current) {
          push()
          current = current.slice(-overlap) + ' ' + s
        } else current += (current ? ' ' : '') + s
      }
      continue
    }
    if (current.length + p.length + 2 > size && current) {
      push()
      current = current.slice(-overlap) + '\n\n' + p
    } else current += (current ? '\n\n' : '') + p
    if (chunks.length >= max) break
  }
  push()
  return chunks.slice(0, max)
}
