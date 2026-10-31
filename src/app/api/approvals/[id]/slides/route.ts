import { assertViewer, createHandler } from '@/lib/api/handler'
import { slideTextSaveSchema } from '@/lib/schemas/slide-text'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { getSlideText, saveSlideText } from '@/services/posts/slide-text'

/** Tekst na slikama (D-129): tekst slajdova ili kadrova videa i čuvanje izmene, bez tokena. */
export const GET = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    rateLimit: { name: 'slide-text', limit: 60, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params }) => getSlideText(assertViewer(viewer), params.id),
)

export const PUT = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    body: slideTextSaveSchema,
    rateLimit: { name: 'slide-text-save', limit: 20, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, body }) => saveSlideText(assertViewer(viewer), params.id, body),
)
