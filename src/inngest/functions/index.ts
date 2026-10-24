import { aiGenerateImage } from './ai-generate-image'
import { aiGenerateStrategy } from './ai-generate-strategy'
import { aiVisualTemplate } from './ai-visual-template'
import { analyticsInsightsWeekly } from './analytics-insights-weekly'
import { autopilotBrandWeek, autopilotDaily, autopilotDeadlines, autopilotWeekly } from './autopilot'
import { brandAnalyze } from './brand-analyze'
import { brandSiteCheck } from './brand-site-check'
import { ping } from './ping'
import { postMetrics } from './post-metrics'
import { publishTarget } from './publish-target'
import { publishWatchdog } from './publish-watchdog'
import { socialAccountMetrics } from './social-account-metrics'
import { socialHistoryImport } from './social-history-import'
import { socialTokenRefresh } from './social-token-refresh'

/** Sve funkcije koje /api/inngest služi. Dodaju se po fazama. */
export const functions = [
  ping,
  aiGenerateImage,
  aiVisualTemplate,
  aiGenerateStrategy,
  brandAnalyze,
  brandSiteCheck,
  socialHistoryImport,
  socialTokenRefresh,
  publishTarget,
  publishWatchdog,
  postMetrics,
  socialAccountMetrics,
  analyticsInsightsWeekly,
  autopilotWeekly,
  autopilotBrandWeek,
  autopilotDeadlines,
  autopilotDaily,
]
