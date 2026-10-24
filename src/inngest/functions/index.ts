import { aiGenerateImage } from './ai-generate-image'
import { aiVisualTemplate } from './ai-visual-template'
import { brandAnalyze } from './brand-analyze'
import { brandSiteCheck } from './brand-site-check'
import { ping } from './ping'
import { socialHistoryImport } from './social-history-import'
import { socialTokenRefresh } from './social-token-refresh'

/** Sve funkcije koje /api/inngest služi. Dodaju se po fazama. */
export const functions = [
  ping,
  aiGenerateImage,
  aiVisualTemplate,
  brandAnalyze,
  brandSiteCheck,
  socialHistoryImport,
  socialTokenRefresh,
]
