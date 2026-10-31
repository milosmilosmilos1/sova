import { z } from 'zod'

/** Gotov MP4 videa u temi (D-128): verzija objave za koju je napravljen i medij iz biblioteke. */
export const themeVideoAttachSchema = z.object({
  version: z.number().int().min(1),
  mediaAssetId: z.uuid(),
})

export const pendingVideosQuerySchema = z.object({ brandId: z.uuid() })
