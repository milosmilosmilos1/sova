import { assertViewer, createHandler } from '@/lib/api/handler'
import { CUSTOM_FONT_MAX_BYTES, removeFontQuerySchema, uploadFontSchema } from '@/lib/schemas/design'
import { uuidParamSchema } from '@/lib/schemas/workspace'
import { removeCustomFont, uploadCustomFont } from '@/services/design/custom-fonts'

/** Otpremanje sopstvenog fonta brenda (D-159): TTF, OTF ili WOFF do 2 MB, kao base64. */
export const POST = createHandler(
  {
    auth: 'user',
    params: uuidParamSchema,
    body: uploadFontSchema,
    maxBodyBytes: Math.ceil((CUSTOM_FONT_MAX_BYTES * 4) / 3) + 4096,
    rateLimit: { name: 'design-font-upload', limit: 10, windowSec: 60, by: 'user' },
  },
  async ({ viewer, params, body }) => uploadCustomFont(assertViewer(viewer), params.id, body),
)

/** Brisanje sopstvenog fonta; izgled koji ga koristi vraća fontove sa sajta. */
export const DELETE = createHandler(
  { auth: 'user', params: uuidParamSchema, query: removeFontQuerySchema },
  async ({ viewer, params, query }) => {
    await removeCustomFont(assertViewer(viewer), params.id, query.family)
    return { removed: query.family }
  },
)
