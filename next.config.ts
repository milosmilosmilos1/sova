import { withSentryConfig } from '@sentry/nextjs/config'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin()

const isProd = process.env.NODE_ENV === 'production'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(self), usb=(), browsing-topics=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
]

const nextConfig: NextConfig = {
  // Aplikacija je gotovo cela dinamička (sesija na svakoj strani); vidi D-011.
  cacheComponents: false,
  poweredByHeader: false,
  reactStrictMode: true,
  // bez Next oznake „N” u uglu tokom razvoja; greške pri kompilaciji i u radu se i dalje prikazuju
  devIndicators: false,
  typedRoutes: true,
  // Native dodaci (.node) ne mogu u Turbopack bundle; učitavaju se iz node_modules u runtime-u (faza 7, resvg).
  serverExternalPackages: ['@resvg/resvg-js', 'sharp'],
  // Inter se čita sa diska u runtime-u (Satori šabloni, PDF izveštaj, D-094): eksplicitno u trace API ruta.
  outputFileTracingIncludes: {
    '/api/**/*': ['src/lib/visuals/fonts/**/*', 'src/lib/visuals/design/sample/**/*'],
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'http', hostname: '127.0.0.1' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}

const configWithIntl = withNextIntl(nextConfig)

export default process.env.SENTRY_DSN
  ? withSentryConfig(configWithIntl, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
      widenClientFileUpload: false,
    })
  : configWithIntl
