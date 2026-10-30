/**
 * Karusel u video (D-118): slajdovi se crtaju na platno u pregledaču (blago uvećanje i pretapanje)
 * i kodiraju u MP4 (H.264, 30 fps, bez zvuka) kroz WebCodecs i Mediabunny. Server ne radi ništa
 * osim prijema gotovog fajla, pa video ne košta tokene. Uspravan video (9:16) stavlja slajd na
 * zamućenu pozadinu iste slike.
 */
export const VIDEO_FORMATS = {
  feed: { width: 1080, height: 1350 },
  reel: { width: 1080, height: 1920 },
} as const
export type VideoFormat = keyof typeof VIDEO_FORMATS

export const VIDEO_FPS = 30
const FADE_SECONDS = 0.4
const ZOOM = 0.03

/** Pravougaonik slike na platnu: cela slika (contain) ili ceo okvir (cover), centrirano, uz uvećanje. */
export function fitRect(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
  mode: 'contain' | 'cover',
  zoom = 1,
): { x: number; y: number; w: number; h: number } {
  const base = mode === 'contain' ? Math.min(boxW / imgW, boxH / imgH) : Math.max(boxW / imgW, boxH / imgH)
  const w = imgW * base * zoom
  const h = imgH * base * zoom
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h }
}

/** Broj kadrova po slajdu i pretapanja; trajanje videa je slajdovi × sekunde. */
export function videoPlan(slides: number, secondsPerSlide: number, fade: boolean) {
  const perSlide = Math.max(1, Math.round(secondsPerSlide * VIDEO_FPS))
  return {
    perSlide,
    fadeFrames: fade && slides > 1 ? Math.min(perSlide - 1, Math.round(FADE_SECONDS * VIDEO_FPS)) : 0,
    totalFrames: perSlide * slides,
    seconds: (perSlide * slides) / VIDEO_FPS,
  }
}

export async function canMakeVideo(format: VideoFormat): Promise<boolean> {
  if (typeof window === 'undefined' || typeof VideoEncoder === 'undefined') return false
  const { canEncodeVideo } = await import('mediabunny')
  return canEncodeVideo('avc', VIDEO_FORMATS[format])
}

/** Slike slajdova (potpisani URL-ovi iz skladišta) kao bitmape za platno. */
export async function loadSlides(urls: string[]): Promise<ImageBitmap[]> {
  return Promise.all(
    urls.map(async (url) => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Slajd nije preuzet (${res.status}).`)
      return createImageBitmap(await res.blob())
    }),
  )
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function drawSlide(
  ctx: Ctx,
  img: ImageBitmap,
  w: number,
  h: number,
  zoom: number,
  alpha: number,
  blurBack: boolean,
) {
  ctx.globalAlpha = alpha
  if (blurBack) {
    // pozadina za 9:16: ista slika preko celog kadra, zamućena i zatamnjena
    const back = fitRect(img.width, img.height, w, h, 'cover', 1.1)
    if ('filter' in ctx) ctx.filter = 'blur(40px) brightness(0.55)'
    ctx.drawImage(img, back.x, back.y, back.w, back.h)
    if ('filter' in ctx) ctx.filter = 'none'
  }
  const r = fitRect(img.width, img.height, w, h, 'contain', zoom)
  ctx.drawImage(img, r.x, r.y, r.w, r.h)
  ctx.globalAlpha = 1
}

export async function renderSlidesVideo(input: {
  slides: ImageBitmap[]
  format: VideoFormat
  secondsPerSlide: number
  fade: boolean
  onProgress?: (share: number) => void
}): Promise<Blob> {
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, QUALITY_HIGH } = await import('mediabunny')
  const { width, height } = VIDEO_FORMATS[input.format]
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height })
  const ctx = canvas.getContext('2d') as Ctx | null
  if (!ctx) throw new Error('Pregledač ne može da crta video.')
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  })
  const source = new CanvasSource(canvas, { codec: 'avc', quality: QUALITY_HIGH, keyFrameInterval: 2 })
  output.addVideoTrack(source, { frameRate: VIDEO_FPS })
  await output.start()

  const plan = videoPlan(input.slides.length, input.secondsPerSlide, input.fade)
  const blurBack = input.format === 'reel'
  for (let f = 0; f < plan.totalFrames; f++) {
    const i = Math.floor(f / plan.perSlide)
    const k = f % plan.perSlide
    ctx.fillStyle = '#0b0b0f'
    ctx.fillRect(0, 0, width, height)
    drawSlide(ctx, input.slides[i]!, width, height, 1 + ZOOM * (k / plan.perSlide), 1, blurBack)
    const next = input.slides[i + 1]
    if (next && plan.fadeFrames && k >= plan.perSlide - plan.fadeFrames) {
      const share = (k - (plan.perSlide - plan.fadeFrames) + 1) / plan.fadeFrames
      drawSlide(ctx, next, width, height, 1, share, blurBack)
    }
    await source.add(f / VIDEO_FPS, 1 / VIDEO_FPS)
    input.onProgress?.((f + 1) / plan.totalFrames)
  }
  source.close()
  await output.finalize()
  const buffer = output.target.buffer
  if (!buffer) throw new Error('Video nije napravljen.')
  return new Blob([buffer], { type: 'video/mp4' })
}
