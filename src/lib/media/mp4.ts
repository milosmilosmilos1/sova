/**
 * Metapodaci MP4 i MOV videa iz ISO BMFF kutija (`moov` → `mvhd`, `trak` → `tkhd`, `hdlr`, `stsd`),
 * bez ffmpeg-a: trajanje, dimenzije kako se video prikazuje (rotacija iz matrice `tkhd`) i kodeci.
 * Telefoni često snimaju vertikalan video kao položen sa rotacijom 90°, pa se širina i visina tada
 * zamenjuju; mreže (Shorts, Reels, TikTok) gledaju prikazane dimenzije.
 */
export interface VideoInfo {
  durationMs: number
  width: number
  height: number
  rotation: 0 | 90 | 180 | 270
  videoCodec: string | null
  audioCodec: string | null
}

interface Box {
  type: string
  start: number
  /** početak sadržaja (posle zaglavlja) */
  body: number
  end: number
}

function boxes(buf: Buffer, from: number, to: number): Box[] {
  const out: Box[] = []
  let pos = from
  while (pos + 8 <= to) {
    let size = buf.readUInt32BE(pos)
    const type = buf.toString('latin1', pos + 4, pos + 8)
    let header = 8
    if (size === 1) {
      if (pos + 16 > to) break
      const big = buf.readBigUInt64BE(pos + 8)
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) break
      size = Number(big)
      header = 16
    } else if (size === 0) {
      size = to - pos
    }
    if (size < header || pos + size > to) break
    out.push({ type, start: pos, body: pos + header, end: pos + size })
    pos += size
  }
  return out
}

function child(buf: Buffer, parent: Box, type: string): Box | undefined {
  return boxes(buf, parent.body, parent.end).find((b) => b.type === type)
}

function children(buf: Buffer, parent: Box, type: string): Box[] {
  return boxes(buf, parent.body, parent.end).filter((b) => b.type === type)
}

function readMvhd(buf: Buffer, box: Box): { timescale: number; duration: number } | null {
  const version = buf.readUInt8(box.body)
  const p = box.body + 4
  if (version === 1) {
    if (p + 28 > box.end) return null
    return { timescale: buf.readUInt32BE(p + 16), duration: Number(buf.readBigUInt64BE(p + 20)) }
  }
  if (p + 16 > box.end) return null
  return { timescale: buf.readUInt32BE(p + 8), duration: buf.readUInt32BE(p + 12) }
}

function readTkhd(
  buf: Buffer,
  box: Box,
): { width: number; height: number; rotation: VideoInfo['rotation'] } | null {
  const version = buf.readUInt8(box.body)
  // posle FullBox zaglavlja: vremena, track_ID, rezervisano, trajanje; pa 8 rezervisanih bajtova,
  // layer, alternate_group, volume, rezervisano (8), matrica 9 × 4 bajta, širina i visina (16.16)
  const matrixAt = box.body + 4 + (version === 1 ? 32 : 20) + 16
  if (matrixAt + 44 > box.end) return null
  const a = buf.readInt32BE(matrixAt)
  const b = buf.readInt32BE(matrixAt + 4)
  const c = buf.readInt32BE(matrixAt + 12)
  const d = buf.readInt32BE(matrixAt + 16)
  const width = buf.readUInt32BE(matrixAt + 36) / 65536
  const height = buf.readUInt32BE(matrixAt + 40) / 65536
  const one = 65536
  let rotation: VideoInfo['rotation'] = 0
  if (a === 0 && b === one && c === -one && d === 0) rotation = 90
  else if (a === 0 && b === -one && c === one && d === 0) rotation = 270
  else if (a === -one && d === -one) rotation = 180
  return { width: Math.round(width), height: Math.round(height), rotation }
}

function handlerOf(buf: Buffer, mdia: Box): string | null {
  const hdlr = child(buf, mdia, 'hdlr')
  if (!hdlr || hdlr.body + 12 > hdlr.end) return null
  return buf.toString('latin1', hdlr.body + 8, hdlr.body + 12)
}

function codecOf(buf: Buffer, mdia: Box): string | null {
  const minf = child(buf, mdia, 'minf')
  const stbl = minf ? child(buf, minf, 'stbl') : undefined
  const stsd = stbl ? child(buf, stbl, 'stsd') : undefined
  if (!stsd || stsd.body + 16 > stsd.end) return null
  // FullBox (4) + entry_count (4), pa prvi zapis: veličina (4) i kodek (4)
  return buf.toString('latin1', stsd.body + 12, stsd.body + 16).trim() || null
}

/** Baca grešku kad fajl nije čitljiv MP4/MOV ili nema video traku. */
export function parseMp4(buf: Buffer): VideoInfo {
  const top = boxes(buf, 0, buf.length)
  const moov = top.find((b) => b.type === 'moov')
  if (!moov) throw new Error('MP4 nema moov kutiju (fajl je nepotpun ili nije MP4/MOV).')
  const mvhdBox = child(buf, moov, 'mvhd')
  const mvhd = mvhdBox ? readMvhd(buf, mvhdBox) : null
  let video: { width: number; height: number; rotation: VideoInfo['rotation']; codec: string | null } | null =
    null
  let audioCodec: string | null = null
  for (const trak of children(buf, moov, 'trak')) {
    const mdia = child(buf, trak, 'mdia')
    if (!mdia) continue
    const handler = handlerOf(buf, mdia)
    if (handler === 'vide' && !video) {
      const tkhdBox = child(buf, trak, 'tkhd')
      const tkhd = tkhdBox ? readTkhd(buf, tkhdBox) : null
      if (tkhd && tkhd.width > 0 && tkhd.height > 0) video = { ...tkhd, codec: codecOf(buf, mdia) }
    } else if (handler === 'soun' && !audioCodec) {
      audioCodec = codecOf(buf, mdia)
    }
  }
  if (!video) throw new Error('Video nema video traku.')
  if (!mvhd || !mvhd.timescale) throw new Error('Video nema trajanje u zaglavlju.')
  const swap = video.rotation === 90 || video.rotation === 270
  return {
    durationMs: Math.round((mvhd.duration / mvhd.timescale) * 1000),
    width: swap ? video.height : video.width,
    height: swap ? video.width : video.height,
    rotation: video.rotation,
    videoCodec: video.codec,
    audioCodec,
  }
}

/**
 * Uklanja lokaciju i ostale metapodatke snimka bez ponovnog kodiranja (kao EXIF kod slika):
 * `meta` u `moov` i trakama (QuickTime ključevi, npr. `com.apple.quicktime.location.ISO6709`) i
 * `©xyz` i `meta` u `udta` postaju `free` kutije iste veličine sa nulama umesto sadržaja, pa
 * struktura fajla ostaje ispravna. Vraća kopiju i broj očišćenih kutija.
 */
export function stripVideoMetadata(input: Buffer): { data: Buffer; stripped: number } {
  const buf = Buffer.from(input)
  let stripped = 0
  const clear = (b: Box) => {
    buf.write('free', b.start + 4, 'latin1')
    buf.fill(0, b.body, b.end)
    stripped++
  }
  const moov = boxes(buf, 0, buf.length).find((b) => b.type === 'moov')
  if (!moov) return { data: buf, stripped }
  const scan = (parent: Box) => {
    for (const b of boxes(buf, parent.body, parent.end)) {
      if (b.type === 'meta') clear(b)
      else if (b.type === 'udta')
        for (const u of boxes(buf, b.body, b.end)) if (u.type === '©xyz' || u.type === 'meta') clear(u)
    }
  }
  scan(moov)
  for (const trak of children(buf, moov, 'trak')) scan(trak)
  return { data: buf, stripped }
}
