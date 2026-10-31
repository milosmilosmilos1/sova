import type { locales } from '@/i18n/config'
import type partA from '@/i18n/messages/parts/a/sr-Latn.json'
import type partB from '@/i18n/messages/parts/b/sr-Latn.json'
import type partC from '@/i18n/messages/parts/c/sr-Latn.json'
import type partD from '@/i18n/messages/parts/d/sr-Latn.json'
import type messages from '@/i18n/messages/sr-Latn.json'

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof locales)[number]
    Messages: typeof messages & typeof partA & typeof partB & typeof partC & typeof partD
  }
}
