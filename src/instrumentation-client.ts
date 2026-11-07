/**
 * Sentry u pregledaču samo kad je podešen (D-164): bez DSN-a se paket (~40 KB gz) ne šalje uopšte.
 * Navigacije pre nego što se paket učita ne beleže se.
 */
type TransitionArgs = Parameters<typeof import('@sentry/nextjs').captureRouterTransitionStart>

let forwardTransition: ((...args: TransitionArgs) => void) | null = null

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      replaysOnErrorSampleRate: 0,
      replaysSessionSampleRate: 0,
    })
    forwardTransition = Sentry.captureRouterTransitionStart
  })
}

export function onRouterTransitionStart(...args: TransitionArgs) {
  forwardTransition?.(...args)
}
