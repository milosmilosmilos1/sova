import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    // Nikad ne šalji cookie-je ni authorization header.
    if (event.request?.headers) {
      delete event.request.headers.cookie
      delete event.request.headers.authorization
    }
    delete event.request?.cookies
    return event
  },
})
