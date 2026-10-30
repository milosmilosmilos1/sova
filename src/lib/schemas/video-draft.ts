import { z } from 'zod'

/** Video iz karusela (D-118): otpremljen MP4 iz biblioteke. */
export const videoDraftSchema = z.object({ mediaAssetId: z.uuid({ error: 'Nedostaje video.' }) })
