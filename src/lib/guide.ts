import type { Route } from 'next'

/**
 * Vodič (D-115): četiri ključna koraka do objava koje Sova sama priprema i gde se svaki rešava.
 * Zajedničko za server (početna, API) i klijent (plutajući prozor).
 */
export const GUIDE_STEPS = ['networks', 'voice', 'flow', 'decision'] as const
export type GuideStepKey = (typeof GUIDE_STEPS)[number]

export const GUIDE_HREF: Record<GuideStepKey, Route> = {
  networks: '/app/accounts',
  voice: '/app/brand',
  flow: '/app/flows/new',
  decision: '/app/approvals',
}
