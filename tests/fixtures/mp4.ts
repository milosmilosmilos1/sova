/**
 * Sintetički MP4/MOV za testove: samo kutije koje čita `parseMp4` i potpis koji prepoznaje file-type,
 * bez stvarnog video sadržaja.
 */
export interface Mp4Options {
  /** glavni brend u `ftyp` (`isom` → video/mp4, `qt  ` → video/quicktime) */
  brand?: string
  durationMs?: number
  width?: number
  height?: number
  rotation?: 0 | 90 | 180 | 270
  videoCodec?: string
  /** `null` = bez audio trake */
  audioCodec?: string | null
  /** bez video trake (samo zvuk) */
  noVideo?: boolean
  moovAtEnd?: boolean
  mdatBytes?: number
  /** 64-bitna veličina `mdat` kutije (size = 1) */
  largeMdat?: boolean
  /** verzija 1 za `mvhd` i `tkhd` (64-bitna vremena) */
  version1?: boolean
  /** lokacija snimka kao na telefonu: `udta/©xyz` i QuickTime `meta` ključ (ISO 6709) */
  location?: string
}

const ONE = 65536

function u32(n: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n >>> 0, 0)
  return b
}

function i32(n: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeInt32BE(n, 0)
  return b
}

function u64(n: number): Buffer {
  const b = Buffer.alloc(8)
  b.writeBigUInt64BE(BigInt(n), 0)
  return b
}

function box(type: string, ...parts: Buffer[]): Buffer {
  const payload = Buffer.concat(parts)
  return Buffer.concat([u32(8 + payload.length), Buffer.from(type, 'latin1'), payload])
}

function fullBox(type: string, version: number, ...parts: Buffer[]): Buffer {
  return box(type, Buffer.from([version, 0, 0, 0]), ...parts)
}

function matrix(rotation: number): Buffer {
  const [a, b, c, d] =
    rotation === 90
      ? [0, ONE, -ONE, 0]
      : rotation === 270
        ? [0, -ONE, ONE, 0]
        : rotation === 180
          ? [-ONE, 0, 0, -ONE]
          : [ONE, 0, 0, ONE]
  return Buffer.concat([i32(a), i32(b), i32(0), i32(c), i32(d), i32(0), i32(0), i32(0), i32(0x40000000)])
}

function mvhd(durationMs: number, v1: boolean): Buffer {
  return v1
    ? fullBox('mvhd', 1, u64(0), u64(0), u32(1000), u64(durationMs), Buffer.alloc(80))
    : fullBox('mvhd', 0, u32(0), u32(0), u32(1000), u32(durationMs), Buffer.alloc(80))
}

function tkhd(width: number, height: number, rotation: number, durationMs: number, v1: boolean): Buffer {
  const times = v1
    ? Buffer.concat([u64(0), u64(0), u32(1), u32(0), u64(durationMs)])
    : Buffer.concat([u32(0), u32(0), u32(1), u32(0), u32(durationMs)])
  return fullBox(
    'tkhd',
    v1 ? 1 : 0,
    times,
    Buffer.alloc(8),
    Buffer.alloc(8),
    matrix(rotation),
    u32(width * ONE),
    u32(height * ONE),
  )
}

function track(handler: string, codec: string, w: number, h: number, rot: number, ms: number, v1: boolean) {
  const hdlr = fullBox(
    'hdlr',
    0,
    u32(0),
    Buffer.from(handler, 'latin1'),
    Buffer.alloc(12),
    Buffer.from('Sova\0'),
  )
  const stsd = fullBox('stsd', 0, u32(1), box(codec, Buffer.alloc(16)))
  return box(
    'trak',
    tkhd(w, h, rot, ms, v1),
    box('mdia', fullBox('mdhd', 0, Buffer.alloc(20)), hdlr, box('minf', box('stbl', stsd))),
  )
}

export function buildMp4(o: Mp4Options = {}): Buffer {
  const ms = o.durationMs ?? 15_000
  const v1 = Boolean(o.version1)
  const ftyp = box(
    'ftyp',
    Buffer.from(o.brand ?? 'isom', 'latin1'),
    u32(512),
    Buffer.from('isomiso2avc1mp41'),
  )
  const tracks: Buffer[] = []
  if (!o.noVideo)
    tracks.push(
      track('vide', o.videoCodec ?? 'avc1', o.width ?? 1080, o.height ?? 1920, o.rotation ?? 0, ms, v1),
    )
  if (o.audioCodec !== null) tracks.push(track('soun', o.audioCodec ?? 'mp4a', 0, 0, 0, ms, v1))
  const extra: Buffer[] = []
  if (o.location) {
    extra.push(box('udta', box('©xyz', Buffer.from(o.location))))
    extra.push(box('meta', Buffer.from(`com.apple.quicktime.location.ISO6709${o.location}`)))
  }
  const moov = box('moov', mvhd(ms, v1), ...tracks, ...extra)
  const payload = Buffer.alloc(o.mdatBytes ?? 1024, 7)
  const mdat = o.largeMdat
    ? Buffer.concat([u32(1), Buffer.from('mdat'), u64(16 + payload.length), payload])
    : box('mdat', payload)
  return o.moovAtEnd ? Buffer.concat([ftyp, mdat, moov]) : Buffer.concat([ftyp, moov, mdat])
}
