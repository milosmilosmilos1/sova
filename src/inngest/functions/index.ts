import { aiGenerateImage } from './ai-generate-image'
import { ping } from './ping'

/** Sve funkcije koje /api/inngest služi. Dodaju se po fazama. */
export const functions = [ping, aiGenerateImage]
