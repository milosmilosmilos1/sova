import 'server-only'

import type { SocialPlatform } from '@/config/platforms'
import { ProviderError } from '@/integrations/social/errors'
import { MetaProvider, type MetaProviderOptions } from '@/integrations/social/meta/provider'
import type { SocialProvider } from '@/integrations/social/types'

/** Provider po mreži; `meta` je zajednički ključ za Facebook i Instagram (jedan OAuth tok). */
export type ConnectProviderKey = 'meta'

let metaOverride: MetaProvider | null = null

export function getMetaProvider(): MetaProvider {
  return metaOverride ?? new MetaProvider()
}

/** Testovi: provider bez pauza pri pollingu ili sa svojim fetch-om. */
export function setMetaProviderForTests(options: MetaProviderOptions | null): void {
  metaOverride = options ? new MetaProvider(options) : null
}

export function providerFor(platform: SocialPlatform): SocialProvider {
  switch (platform) {
    case 'facebook':
    case 'instagram':
      return getMetaProvider()
    default:
      throw new ProviderError('NOT_SUPPORTED', { userMessage: `Mreža ${platform} stiže u sledećoj fazi.` })
  }
}

export function connectKeyFor(provider: string): ConnectProviderKey | null {
  if (provider === 'facebook' || provider === 'instagram' || provider === 'meta') return 'meta'
  return null
}

export function isProviderConfigured(key: ConnectProviderKey): boolean {
  return key === 'meta' ? MetaProvider.isConfigured() : false
}
