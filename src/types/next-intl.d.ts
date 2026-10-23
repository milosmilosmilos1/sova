import type { locales } from '@/i18n/config'
import type messages from '@/i18n/messages/sr-Latn.json'

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof locales)[number]
    Messages: typeof messages
  }
}
