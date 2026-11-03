import sharp from 'sharp'
import { getDocumentProxy } from 'unpdf'
import { describe, expect, it } from 'vitest'

import { imagesToPdf } from './pdf'

const page = async (color: string, width = 540, height = 675) => {
  const { data, info } = await sharp({ create: { width, height, channels: 3, background: color } })
    .jpeg({ quality: 80, progressive: false, mozjpeg: false })
    .toBuffer({ resolveWithObject: true })
  return { jpeg: data, width: info.width, height: info.height }
}

describe('PDF od slika za LinkedIn dokument (D-149)', () => {
  it('svaka slika je strana svoje veličine, a pdf.js čita broj strana i naslov', async () => {
    const pdf = imagesToPdf([await page('#ff6600'), await page('#003366', 1080, 1080)], {
      title: 'Tri greške — vodič',
    })
    expect(pdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4')
    const doc = await getDocumentProxy(new Uint8Array(pdf))
    expect(doc.numPages).toBe(2)
    const second = (await doc.getPage(2)).getViewport({ scale: 1 })
    expect([second.width, second.height]).toEqual([1080, 1080])
    const meta = (await doc.getMetadata()).info as { Title?: string }
    expect(meta.Title).toBe('Tri greške — vodič')
  })

  it('tabela pomeraja pokazuje tačno na svaki objekat', async () => {
    const pdf = imagesToPdf([await page('#22aa55')])
    const text = pdf.toString('latin1')
    const xref = Number(/startxref\n(\d+)/.exec(text)![1])
    expect(text.slice(xref, xref + 4)).toBe('xref')
    const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
    expect(offsets).toHaveLength(6)
    offsets.forEach((o, i) => expect(text.startsWith(`${i + 1} 0 obj\n`, o), `objekat ${i + 1}`).toBe(true))
  })
})
