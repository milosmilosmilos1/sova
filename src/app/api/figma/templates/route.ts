import { assertViewer, createHandler } from '@/lib/api/handler'
import { figmaTemplateSaveSchema } from '@/lib/schemas/figma'
import { saveFigmaTemplate } from '@/services/figma/templates'

/** Okviri iz Figme kao šablon brenda (D-162): raspored i pozadina jednom, crtanje posle iz Sove. */
export const POST = createHandler(
  {
    auth: 'user',
    body: figmaTemplateSaveSchema,
    rateLimit: { name: 'figma-template', limit: 6, windowSec: 60, by: 'user' },
  },
  async ({ viewer, body }) => saveFigmaTemplate(assertViewer(viewer), body),
)
