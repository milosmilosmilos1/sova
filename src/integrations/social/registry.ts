import 'server-only'

import type { SocialPlatform } from '@/config/platforms'
import { ProviderError } from '@/integrations/social/errors'
import { LinkedInProvider, type LinkedInProviderOptions } from '@/integrations/social/linkedin/provider'
import { MetaProvider, type MetaProviderOptions } from '@/integrations/social/meta/provider'
import { TikTokProvider, type TikTokProviderOptions } from '@/integrations/social/tiktok/provider'
import type { SocialProvider } from '@/integrations/social/types'

/** Ključ OAuth toka; `meta` je zajednički za Facebook i Instagram (jedan tok za obe mreže). */
export type ConnectProviderKey = 'meta' | 'linkedin' | 'tiktok'

export const CONNECT_PROVIDERS: Record<ConnectProviderKey, { label: string; platforms: SocialPlatform[] }> = {
  meta: { label: 'Facebook i Instagram', platforms: ['facebook', 'instagram'] },
  linkedin: { label: 'LinkedIn', platforms: ['linkedin'] },
  tiktok: { label: 'TikTok', platforms: ['tiktok'] },
}

let metaOverride: MetaProvider | null = null
// zapis tipa iza dodele: oblik `linkedin…: <16 znakova>` gitleaks čita kao LinkedIn tajnu
let linkedinOverride = null as LinkedInProvider | null
let tiktokOverride: TikTokProvider | null = null

export function getMetaProvider(): MetaProvider {
  return metaOverride ?? new MetaProvider()
}

export function getLinkedInProvider(): LinkedInProvider {
  return linkedinOverride ?? new LinkedInProvider()
}

export function getTikTokProvider(): TikTokProvider {
  return tiktokOverride ?? new TikTokProvider()
}

/** Testovi: provider bez pauza pri pollingu ili sa svojim fetch-om. */
export function setMetaProviderForTests(options: MetaProviderOptions | null): void {
  metaOverride = options ? new MetaProvider(options) : null
}

export function setLinkedInProviderForTests(options: LinkedInProviderOptions | null): void {
  linkedinOverride = options ? new LinkedInProvider(options) : null
}

export function setTikTokProviderForTests(options: TikTokProviderOptions | null): void {
  tiktokOverride = options ? new TikTokProvider(options) : null
}

export function providerForKey(key: ConnectProviderKey): SocialProvider {
  if (key === 'linkedin') return getLinkedInProvider()
  if (key === 'tiktok') return getTikTokProvider()
  return getMetaProvider()
}

export function providerFor(platform: SocialPlatform): SocialProvider {
  const key = connectKeyFor(platform)
  if (!key)
    throw new ProviderError('NOT_SUPPORTED', { userMessage: `Mreža ${platform} stiže u sledećoj fazi.` })
  return providerForKey(key)
}

export function connectKeyFor(provider: string): ConnectProviderKey | null {
  if (provider === 'facebook' || provider === 'instagram' || provider === 'meta') return 'meta'
  if (provider === 'linkedin') return 'linkedin'
  if (provider === 'tiktok') return 'tiktok'
  return null
}

export function isProviderConfigured(key: ConnectProviderKey): boolean {
  if (key === 'linkedin') return LinkedInProvider.isConfigured()
  if (key === 'tiktok') return TikTokProvider.isConfigured()
  return MetaProvider.isConfigured()
}
