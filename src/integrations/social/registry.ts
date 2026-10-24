import 'server-only'

import type { SocialPlatform } from '@/config/platforms'
import { ProviderError } from '@/integrations/social/errors'
import {
  GoogleBusinessProvider,
  type GoogleBusinessProviderOptions,
} from '@/integrations/social/google-business/provider'
import { LinkedInProvider, type LinkedInProviderOptions } from '@/integrations/social/linkedin/provider'
import { MetaProvider, type MetaProviderOptions } from '@/integrations/social/meta/provider'
import { TikTokProvider, type TikTokProviderOptions } from '@/integrations/social/tiktok/provider'
import type { SocialProvider } from '@/integrations/social/types'

/**
 * Ključ OAuth toka; `meta` je zajednički za Facebook i Instagram (jedan tok za obe mreže). Google
 * poslovni profil i YouTube imaju odvojene tokove (isti Google klijent, različite dozvole).
 */
export type ConnectProviderKey = 'meta' | 'linkedin' | 'tiktok' | 'google_business'

export const CONNECT_PROVIDERS: Record<ConnectProviderKey, { label: string; platforms: SocialPlatform[] }> = {
  meta: { label: 'Facebook i Instagram', platforms: ['facebook', 'instagram'] },
  linkedin: { label: 'LinkedIn', platforms: ['linkedin'] },
  tiktok: { label: 'TikTok', platforms: ['tiktok'] },
  google_business: { label: 'Google poslovni profil', platforms: ['google_business'] },
}

let metaOverride: MetaProvider | null = null
// zapis tipa iza dodele: oblik `linkedin…: <16 znakova>` gitleaks čita kao LinkedIn tajnu
let linkedinOverride = null as LinkedInProvider | null
let tiktokOverride: TikTokProvider | null = null
let googleBusinessOverride: GoogleBusinessProvider | null = null

export function getMetaProvider(): MetaProvider {
  return metaOverride ?? new MetaProvider()
}

export function getLinkedInProvider(): LinkedInProvider {
  return linkedinOverride ?? new LinkedInProvider()
}

export function getTikTokProvider(): TikTokProvider {
  return tiktokOverride ?? new TikTokProvider()
}

export function getGoogleBusinessProvider(): GoogleBusinessProvider {
  return googleBusinessOverride ?? new GoogleBusinessProvider()
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

export function setGoogleBusinessProviderForTests(options: GoogleBusinessProviderOptions | null): void {
  googleBusinessOverride = options ? new GoogleBusinessProvider(options) : null
}

export function providerForKey(key: ConnectProviderKey): SocialProvider {
  switch (key) {
    case 'linkedin':
      return getLinkedInProvider()
    case 'tiktok':
      return getTikTokProvider()
    case 'google_business':
      return getGoogleBusinessProvider()
    case 'meta':
      return getMetaProvider()
  }
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
  if (provider === 'google_business') return 'google_business'
  return null
}

/**
 * Mreže koje dele isti identitet korisnika i isti opoziv: Meta opoziv važi za Facebook i Instagram,
 * Google opoziv ukida dozvole i za YouTube i za poslovni profil.
 */
export function revokeGroupFor(platform: SocialPlatform): SocialPlatform[] {
  if (platform === 'facebook' || platform === 'instagram') return ['facebook', 'instagram']
  if (platform === 'youtube' || platform === 'google_business') return ['youtube', 'google_business']
  return [platform]
}

export function isProviderConfigured(key: ConnectProviderKey): boolean {
  switch (key) {
    case 'linkedin':
      return LinkedInProvider.isConfigured()
    case 'tiktok':
      return TikTokProvider.isConfigured()
    case 'google_business':
      return GoogleBusinessProvider.isConfigured()
    case 'meta':
      return MetaProvider.isConfigured()
  }
}
