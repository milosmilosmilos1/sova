// Favicon i Apple ikona iz znaka Sove (D-099): node scripts/make-icons.mjs
// Ulaz je src/app/icon.svg (zaobljen kvadrat sa očima, kao OwlMark na landingu). Izlaz:
// src/app/favicon.ico (16, 32 i 48 px kao PNG unutar ICO) i src/app/apple-icon.png (180 px, pun
// kvadrat bez providnosti, iOS sam zaobljava uglove). Pokrenuti ponovo kad stigne pravi logo.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = (f) => path.join(root, 'src', 'app', f)

const svg = await readFile(app('icon.svg'))
// 16 px ima svoju verziju poravnatu na piksele: smanjen crtež od 32 px spaja oči u mrlju
const small = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <rect width="16" height="16" rx="4" fill="#3DA9FC"/>
  <circle cx="4" cy="8" r="3" fill="#fff"/>
  <circle cx="12" cy="8" r="3" fill="#fff"/>
  <circle cx="4" cy="8" r="1.25" fill="#04121F"/>
  <circle cx="12" cy="8" r="1.25" fill="#04121F"/>
</svg>`)
const sizes = [16, 32, 48]
const pngs = await Promise.all(
  sizes.map((s) =>
    sharp(s === 16 ? small : svg, { density: 72 * 4 })
      .resize(s, s)
      .png()
      .toBuffer(),
  ),
)

// ICO: zaglavlje (6 bajtova), po 16 bajtova opisa za svaku sliku, pa same PNG slike
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(pngs.length, 4)
let offset = 6 + 16 * pngs.length
const entries = pngs.map((png, i) => {
  const e = Buffer.alloc(16)
  e.writeUInt8(sizes[i] % 256, 0)
  e.writeUInt8(sizes[i] % 256, 1)
  e.writeUInt8(0, 2)
  e.writeUInt8(0, 3)
  e.writeUInt16LE(1, 4)
  e.writeUInt16LE(32, 6)
  e.writeUInt32LE(png.length, 8)
  e.writeUInt32LE(offset, 12)
  offset += png.length
  return e
})
await writeFile(app('favicon.ico'), Buffer.concat([header, ...entries, ...pngs]))

const apple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <rect width="180" height="180" fill="#3DA9FC"/>
  <circle cx="54" cy="90" r="32" fill="#fff"/>
  <circle cx="126" cy="90" r="32" fill="#fff"/>
  <circle cx="54" cy="90" r="13.5" fill="#04121F"/>
  <circle cx="126" cy="90" r="13.5" fill="#04121F"/>
</svg>`
await writeFile(app('apple-icon.png'), await sharp(Buffer.from(apple)).png().toBuffer())
console.log('favicon.ico (16, 32, 48) i apple-icon.png (180) su napravljeni')
