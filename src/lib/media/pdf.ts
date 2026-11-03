/**
 * PDF od slika (D-149): svaka slika je jedna strana svoje veličine, kao JPEG (DCTDecode), bez spoljne
 * biblioteke. LinkedIn takav PDF prikazuje kao dokument koji se prevlači strana po strana.
 */
export interface PdfPage {
  /** osnovni (ne progresivni) RGB JPEG */
  jpeg: Buffer
  width: number
  height: number
}

/** Tekst kao UTF-16BE sa oznakom reda bajtova, u heks zapisu: srpska slova bez pravila za escape. */
function pdfText(text: string): string {
  const bytes: number[] = [0xfe, 0xff]
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    const units =
      code > 0xffff ? [0xd800 + ((code - 0x10000) >> 10), 0xdc00 + ((code - 0x10000) & 0x3ff)] : [code]
    for (const u of units) bytes.push(u >> 8, u & 0xff)
  }
  return `<${bytes.map((b) => b.toString(16).padStart(2, '0')).join('')}>`
}

export function imagesToPdf(pages: readonly PdfPage[], meta: { title?: string | null } = {}): Buffer {
  if (!pages.length) throw new Error('PDF bez strana')
  const chunks: Buffer[] = []
  const offsets: number[] = []
  let length = 0
  const push = (part: Buffer | string) => {
    const buf = typeof part === 'string' ? Buffer.from(part, 'latin1') : part
    chunks.push(buf)
    length += buf.length
  }
  const obj = (id: number, parts: Array<Buffer | string>) => {
    offsets[id] = length
    push(`${id} 0 obj\n`)
    for (const p of parts) push(p)
    push('\nendobj\n')
  }

  // zaglavlje sa bajtovima iznad 127: čitači tako znaju da je fajl binaran
  push(
    Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]),
  )
  // 1 katalog, 2 strane, 3 podaci o fajlu, pa po tri objekta za svaku stranu (strana, sadržaj, slika)
  const pageIds = pages.map((_, i) => 4 + i * 3)
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>'])
  obj(2, [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`])
  obj(3, [`<< /Producer (Sova)${meta.title ? ` /Title ${pdfText(meta.title)}` : ''} >>`])
  pages.forEach((p, i) => {
    const pageId = pageIds[i]!
    const content = `q\n${p.width} 0 0 ${p.height} 0 0 cm\n/Im0 Do\nQ\n`
    obj(pageId, [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.width} ${p.height}] /Resources << /XObject << /Im0 ${pageId + 2} 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
    ])
    obj(pageId + 1, [`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n`, content, 'endstream'])
    obj(pageId + 2, [
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
      p.jpeg,
      '\nendstream',
    ])
  })
  const size = 4 + pages.length * 3
  const xref = length
  push(`xref\n0 ${size}\n0000000000 65535 f \n`)
  for (let id = 1; id < size; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return Buffer.concat(chunks)
}
