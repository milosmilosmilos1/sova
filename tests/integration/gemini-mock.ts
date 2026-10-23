import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

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

export function resetGeminiMock(): void {
  queue.length = 0
  calls.length = 0
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
      calls.push({ model, body })
      const reply = queue.shift() ?? { kind: 'text', json: defaultTextOutput }
      if (reply.kind === 'status') return HttpResponse.json(buildBody(reply), { status: reply.status })
      return HttpResponse.json(buildBody(reply))
    },
  ),
)
