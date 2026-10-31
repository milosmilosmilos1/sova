import { getStyle, type StyleId } from './index'
import type { Slide } from './types'

/**
 * Video u temi (D-128): kratak uspravan video od kadrova sa tekstom teme preko snimka. Server crta
 * sloj teksta za svaki kadar, a pregledač ga stavlja preko snimka i kodira MP4 (kao D-118), pa
 * video ne košta ni tokene ni rad servera. Ovde su pravila koja dele server i pregledač.
 */
export const THEME_VIDEO = { width: 1080, height: 1920, fps: 30 } as const

/** Najviše kadrova sa tekstom (naslov i tri poruke) pre poziva na akciju. */
const MAX_TEXT_SCENES = 4

/** Stil videa: stil teme ako crta fotografiju, inače Poster (snimak preko celog kadra). */
export function videoStyleFor(styleId: StyleId): StyleId {
  return getStyle(styleId).photo === 'none' ? 'poster' : styleId
}

/**
 * Kadrovi od slajdova: svaki kadar sa tekstom crta se kao naslovni slajd teme, jer naslovni slajd
 * u svakom stilu sa fotografijom ima i fotografiju (tu ide snimak); poziv na akciju ostaje završni
 * kadar teme.
 */
export function videoScenes(slides: Slide[]): Slide[] {
  const cta = slides.find((s) => s.kind === 'cta')
  const text = slides.filter((s) => s.kind !== 'cta').slice(0, MAX_TEXT_SCENES)
  return [
    ...text.map((s) => ({ ...s, kind: 'cover' as const, items: null, stat: null })),
    ...(cta ? [cta] : []),
  ]
}

/** Trajanje kadra: kratak naslov 3 s, duži tekst do 4,5 s, završni kadar 2,5 s. */
export function sceneSeconds(scene: Pick<Slide, 'kind' | 'title' | 'body'>): number {
  if (scene.kind === 'cta') return 2.5
  const chars = scene.title.length + (scene.body?.length ?? 0)
  return Math.round(Math.min(4.5, Math.max(3, 2 + chars / 40)) * 10) / 10
}

/**
 * Snimak ispod svakog kadra: prva polovina kadrova ide preko prvog snimka, druga preko drugog, a
 * kadar nastavlja snimak tamo gde je prethodni stao. Bez snimaka kadar ide preko fotografije.
 */
export function clipPlan(seconds: number[], clips: number): Array<{ clip: number | null; start: number }> {
  if (!clips) return seconds.map(() => ({ clip: null, start: 0 }))
  const perClip = Math.ceil(seconds.length / Math.min(clips, seconds.length))
  const offsets = new Map<number, number>()
  return seconds.map((s, i) => {
    const clip = Math.min(clips - 1, Math.floor(i / perClip))
    const start = offsets.get(clip) ?? 0
    offsets.set(clip, start + s)
    return { clip, start }
  })
}
