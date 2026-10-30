import { aiGenerateImage } from './ai-generate-image'
import { aiGenerateStrategy } from './ai-generate-strategy'
import { aiVisualTemplate } from './ai-visual-template'
import { analyticsInsightsWeekly } from './analytics-insights-weekly'
import { autopilotBrandWeek, autopilotDaily, autopilotDeadlines, autopilotWeekly } from './autopilot'
import { billingDaily, billingProcessEvent } from './billing'
import { brandAnalyze } from './brand-analyze'
import { brandDocumentIndex } from './brand-document-index'
import { brandSiteCheck } from './brand-site-check'
import { canvaExportVideo } from './canva-export-video'
import { flowRun, flowsTick } from './flows'
import { mediaIncomingCleanup } from './media-incoming-cleanup'
import { ping } from './ping'
import { postMetrics } from './post-metrics'
import { publishTarget } from './publish-target'
import { publishWatchdog } from './publish-watchdog'
import { reportMonthlyBrand, reportsMonthly } from './reports-monthly'
import { socialAccountMetrics } from './social-account-metrics'
import { socialHistoryImport } from './social-history-import'
import { socialTokenRefresh } from './social-token-refresh'

/** Sve funkcije koje /api/inngest služi. Dodaju se po fazama. */
export const functions = [
  ping,
  aiGenerateImage,
  aiVisualTemplate,
  aiGenerateStrategy,
  canvaExportVideo,
  brandAnalyze,
  brandDocumentIndex,
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
  flowsTick,
  flowRun,
  mediaIncomingCleanup,
  billingProcessEvent,
  billingDaily,
  reportsMonthly,
  reportMonthlyBrand,
]
