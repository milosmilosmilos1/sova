import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

import { PHOTO_CHECK_TAG, type MatchLevel, type PeopleVerdict } from '@/lib/ai/prompts/photo-check'
import { PHOTO_QUERY_TAG } from '@/lib/ai/prompts/photo-query'

/**
 * MSW mock Gemini API-ja za integracione testove: red odgovora po pozivu,
 * podrazumevano uspešan JSON tekst. Supabase i ostalo prolaze netaknuto (bypass).
 */
export type MockReply =
  | { kind: 'text'; json: unknown; usage?: { input: number; output: number } }
  | { kind: 'image'; base64: string; mimeType?: string; note?: string }
  | { kind: 'status'; status: number; body?: unknown }
  | { kind: 'blocked' }
  | { kind: 'raw'; body: unknown }

const queue: MockReply[] = []
export const calls: Array<{ model: string; body: unknown }> = []

export function enqueueReply(...replies: MockReply[]): void {
  queue.push(...replies)
}

/**
 * Provera fotografija (D-154, D-167, D-169) ima svoj red: ne troši odgovore ostalih poziva i ne ulazi
 * u `calls`. Bez odgovora u redu svaka slika je bez ljudi, odgovara temi, upotrebljiva, prizor (sme da
 * se iseče) preko celog kadra; `fail` vraća grešku 500. Stavka može biti samo ocena ljudi („other”)
 * ili cela ocena.
 */
export interface PhotoCheckReply {
  people?: PeopleVerdict
  match?: MatchLevel
  usable?: boolean
  /** predmet mora ostati ceo */
  whole?: boolean
  /** okvir glavnog predmeta [levo, gore, desno, dole], u procentima */
  box?: [number, number, number, number]
}
const photoQueue: Array<Array<PeopleVerdict | PhotoCheckReply> | 'fail'> = []
/** svaki poziv provere: model, broj slika i tekst zahteva (tema i upit) */
export const photoCalls: Array<{ model: string; images: number; text: string }> = []

export function enqueuePeopleVerdicts(...replies: Array<PeopleVerdict[] | 'fail'>): void {
  photoQueue.push(...replies)
}

export function enqueuePhotoChecks(...replies: Array<PhotoCheckReply[] | 'fail'>): void {
  photoQueue.push(...replies)
}

/**
 * Upit za fotografije starije objave (D-167) takođe ima svoj red, da ne troši odgovore ostalih
 * poziva; bez odgovora u redu upit je „mock photo query”.
 */
const photoQueryQueue: string[] = []
export const photoQueryCalls: Array<{ text: string }> = []

export function enqueuePhotoQueries(...queries: string[]): void {
  photoQueryQueue.push(...queries)
}

export function resetGeminiMock(): void {
  queue.length = 0
  calls.length = 0
  photoQueue.length = 0
  photoCalls.length = 0
  photoQueryQueue.length = 0
  photoQueryCalls.length = 0
}

export const defaultTextOutput = {
  image_description: null,
  variants: [
    {
      platform: 'instagram',
      hook: 'Leto bez znoja počinje sa čistom klimom',
      body: 'Servis klima uređaja uz dolazak na adresu u Beogradu. Kratko, jasno i bez skrivenih troškova.',
      cta: 'Zakažite termin porukom.',
      hashtags: ['#klima', '#beograd', '#servis'],
      alt_text: 'Serviser čisti unutrašnju jedinicu klima uređaja.',
      first_comment: 'Više informacija na sajtu.',
    },
  ],
}

function buildBody(reply: MockReply): Record<string, unknown> {
  switch (reply.kind) {
    case 'text':
      return {
        candidates: [
          {
            content: { role: 'model', parts: [{ text: JSON.stringify(reply.json) }] },
            finishReason: 'STOP',
            index: 0,
          },
        ],
        usageMetadata: {
          promptTokenCount: reply.usage?.input ?? 1200,
          candidatesTokenCount: reply.usage?.output ?? 300,
          totalTokenCount: (reply.usage?.input ?? 1200) + (reply.usage?.output ?? 300),
        },
        modelVersion: 'mock',
      }
    case 'image':
      return {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                ...(reply.note ? [{ text: reply.note }] : []),
                { inlineData: { mimeType: reply.mimeType ?? 'image/png', data: reply.base64 } },
              ],
            },
            finishReason: 'STOP',
            index: 0,
          },
        ],
        usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 1290, totalTokenCount: 1370 },
      }
    case 'blocked':
      return {
        promptFeedback: { blockReason: 'SAFETY' },
        usageMetadata: { promptTokenCount: 10, totalTokenCount: 10 },
      }
    case 'raw':
      return reply.body as Record<string, unknown>
    case 'status':
      return (
        (reply.body as Record<string, unknown> | undefined) ?? {
          error: { code: reply.status, message: 'mock error', status: 'INTERNAL' },
        }
      )
  }
}

export const geminiServer = setupServer(
  http.post(
    /https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/([^/:]+):generateContent/,
    async ({ request }) => {
      const url = new URL(request.url)
      const model = url.pathname.split('/models/')[1]?.split(':')[0] ?? 'unknown'
      let body: unknown = null
      try {
        body = await request.json()
      } catch {
        body = null
      }
      const raw = JSON.stringify(body ?? null)
      if (raw.includes(PHOTO_CHECK_TAG)) {
        const images = (raw.match(/"inline_?[dD]ata"/g) ?? []).length
        // tekst zahteva bez slika (base64 bi samo napunio memoriju testa)
        const text = raw.replace(/"data":"[^"]*"/g, '"data":""')
        photoCalls.push({ model, images, text })
        const replies = photoQueue.shift()
        if (replies === 'fail')
          return HttpResponse.json(buildBody({ kind: 'status', status: 500 }), { status: 500 })
        const items = Array.from({ length: images }, (_, index) => {
          const r = replies?.[index]
          const reply: PhotoCheckReply = typeof r === 'string' ? { people: r } : (r ?? {})
          const [left, top, right, bottom] = reply.box ?? [0, 0, 100, 100]
          return {
            index,
            people: reply.people ?? 'none',
            match: reply.match ?? 'exact',
            usable: reply.usable ?? true,
            whole: reply.whole ?? false,
            box_left: left,
            box_top: top,
            box_right: right,
            box_bottom: bottom,
          }
        })
        return HttpResponse.json(buildBody({ kind: 'text', json: { items } }))
      }
      if (raw.includes(PHOTO_QUERY_TAG)) {
        photoQueryCalls.push({ text: raw })
        const query = photoQueryQueue.shift() ?? 'mock photo query'
        return HttpResponse.json(buildBody({ kind: 'text', json: { query } }))
      }
      calls.push({ model, body })
      const reply = queue.shift() ?? { kind: 'text', json: defaultTextOutput }
      if (reply.kind === 'status') return HttpResponse.json(buildBody(reply), { status: reply.status })
      return HttpResponse.json(buildBody(reply))
    },
  ),
)
