import { fitRect } from './slides-video'

/**
 * Video u temi u pregledaču (D-128): za svaki kadar snimak (ili fotografija sa laganim uvećanjem),
 * preko njega sloj teksta teme koji ulazi odozdo i pretapa se sa prethodnim, pa MP4 (H.264, bez
 * zvuka) kroz WebCodecs i Mediabunny, kao „Napravi video” (D-118). Server ne kodira ništa.
 */
export interface ThemeVideoSpec {
  postId: string
  version: number
  width: number
  height: number
  fps: number
  background: string
  scenes: Array<{
    overlayUrl: string
    seconds: number
    clip: { url: string; start: number } | null
    photoUrl: string | null
  }>
}

/** Ulaz teksta: pretapanje i pomak odozdo, prvih 0,4 s kadra. */
const ENTER_SECONDS = 0.4
const RISE_PX = 48
/** Lagano uvećanje snimka ili fotografije tokom kadra. */
const ZOOM = 0.06

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type Drawable = CanvasImageSource & { width: number; height: number }

const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3

/** Udeo teksta koji je ušao i pomak naviše za kadar `k` od `n` (pretapanje sa prethodnim kadrom). */
export function enterAt(k: number, fps: number): { share: number; offset: number } {
  const share = easeOut(k / Math.max(1, ENTER_SECONDS * fps))
  return { share, offset: (1 - share) * RISE_PX }
}

/** Trenutak snimka za kadar: od `start`, ukrug kad je snimak kraći od kadrova. */
export function clipTime(start: number, k: number, fps: number, duration: number): number {
  const t = start + k / fps
  return duration > 0.1 ? t % duration : 0
}

async function bitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Deo videa nije preuzet (${res.status}).`)
  return createImageBitmap(await res.blob())
}

function drawCover(ctx: Ctx, img: Drawable, w: number, h: number, zoom: number) {
  const r = fitRect(img.width, img.height, w, h, 'cover', zoom)
  ctx.drawImage(img, r.x, r.y, r.w, r.h)
}

export async function renderThemeVideo(
  spec: ThemeVideoSpec,
  onProgress?: (share: number) => void,
): Promise<Blob> {
  const mb = await import('mediabunny')
  const { width, height, fps } = spec
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height })
  const ctx = canvas.getContext('2d') as Ctx | null
  if (!ctx) throw new Error('Pregledač ne može da crta video.')

  // delovi videa: slojevi teksta, fotografije i snimci (isti snimak se preuzima jednom)
  const overlays = await Promise.all(spec.scenes.map((s) => bitmap(s.overlayUrl)))
  const photos = await Promise.all(spec.scenes.map((s) => (s.photoUrl ? bitmap(s.photoUrl) : null)))
  const clipUrls = [...new Set(spec.scenes.flatMap((s) => (s.clip ? [s.clip.url] : [])))]
  const inputs: Array<InstanceType<typeof mb.Input>> = []
  const clips = new Map<string, { sink: InstanceType<typeof mb.CanvasSink>; duration: number }>()
  for (const url of clipUrls) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Snimak nije preuzet (${res.status}).`)
    const input = new mb.Input({ source: new mb.BlobSource(await res.blob()), formats: mb.ALL_FORMATS })
    inputs.push(input)
    const track = await input.getPrimaryVideoTrack()
    if (!track || !(await track.canDecode())) throw new Error('Pregledač ne može da pročita snimak.')
    clips.set(url, {
      sink: new mb.CanvasSink(track, { poolSize: 2 }),
      duration: await track.computeDuration(),
    })
  }

  const output = new mb.Output({
    format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new mb.BufferTarget(),
  })
  const source = new mb.CanvasSource(canvas, { codec: 'avc', quality: mb.QUALITY_HIGH, keyFrameInterval: 2 })
  output.addVideoTrack(source, { frameRate: fps })
  await output.start()

  const frames = spec.scenes.map((s) => Math.max(1, Math.round(s.seconds * fps)))
  const total = frames.reduce((a, b) => a + b, 0)
  let written = 0
  try {
    for (let i = 0; i < spec.scenes.length; i++) {
      const scene = spec.scenes[i]!
      const n = frames[i]!
      const clip = scene.clip ? clips.get(scene.clip.url) : undefined
      const times = clip
        ? Array.from({ length: n }, (_, k) => clipTime(scene.clip!.start, k, fps, clip.duration))
        : []
      const decoded = clip ? clip.sink.canvasesAtTimestamps(times) : null
      for (let k = 0; k < n; k++) {
        const zoom = 1 + ZOOM * (k / n)
        ctx.globalAlpha = 1
        ctx.fillStyle = spec.background
        ctx.fillRect(0, 0, width, height)
        const frame = decoded ? (await decoded.next()).value : null
        if (frame) drawCover(ctx, frame.canvas as Drawable, width, height, zoom)
        else if (photos[i]) drawCover(ctx, photos[i]!, width, height, zoom)
        const { share, offset } = enterAt(k, fps)
        // prethodni kadar se pretapa u novi; prvi kadar počinje čistim snimkom
        if (i > 0 && share < 1) {
          ctx.globalAlpha = 1 - share
          ctx.drawImage(overlays[i - 1]!, 0, 0, width, height)
        }
        ctx.globalAlpha = share
        ctx.drawImage(overlays[i]!, 0, offset, width, height)
        ctx.globalAlpha = 1
        await source.add(written / fps, 1 / fps)
        written++
        onProgress?.(written / total)
      }
      if (decoded) await decoded.return(undefined)
    }
    source.close()
    await output.finalize()
  } finally {
    overlays.forEach((b) => b.close())
    photos.forEach((b) => b?.close())
    inputs.forEach((input) => input.dispose())
  }
  const buffer = output.target.buffer
  if (!buffer) throw new Error('Video nije napravljen.')
  return new Blob([buffer], { type: 'video/mp4' })
}
