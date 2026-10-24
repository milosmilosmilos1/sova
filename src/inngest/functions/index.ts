import { aiGenerateImage } from './ai-generate-image'
import { brandAnalyze } from './brand-analyze'
import { brandSiteCheck } from './brand-site-check'
import { ping } from './ping'

/** Sve funkcije koje /api/inngest služi. Dodaju se po fazama. */
export const functions = [ping, aiGenerateImage, brandAnalyze, brandSiteCheck]
