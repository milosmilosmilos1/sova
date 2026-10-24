import 'server-only'

import type { SocialPlatform } from '@/config/platforms'
import { ProviderError } from '@/integrations/social/errors'
import {
  GoogleBusinessProvider,
  type GoogleBusinessProviderOptions,
} from '@/integrations/social/google-business/provider'
import { LinkedInProvider, type LinkedInProviderOptions } from '@/integrations/social/linkedin/provider'
import { MetaProvider, type MetaProviderOptions } from '@/integrations/social/meta/provider'
import { PinterestProvider, type PinterestProviderOptions } from '@/integrations/social/pinterest/provider'
import { TikTokProvider, type TikTokProviderOptions } from '@/integrations/social/tiktok/provider'
import type { SocialProvider } from '@/integrations/social/types'
import { XProvider, type XProviderOptions } from '@/integrations/social/x/provider'
import { YouTubeProvider, type YouTubeProviderOptions } from '@/integrations/social/youtube/provider'

/**
 * Ključ OAuth toka; `meta` je zajednički za Facebook i Instagram (jedan tok za obe mreže). Google
 * poslovni profil i YouTube imaju odvojene tokove (isti Google klijent, različite dozvole).
 */
export type ConnectProviderKey =
  'meta' | 'linkedin' | 'tiktok' | 'google_business' | 'youtube' | 'pinterest' | 'x'

export const CONNECT_PROVIDERS: Record<ConnectProviderKey, { label: string; platforms: SocialPlatform[] }> = {
  meta: { label: 'Facebook i Instagram', platforms: ['facebook', 'instagram'] },
  linkedin: { label: 'LinkedIn', platforms: ['linkedin'] },
  tiktok: { label: 'TikTok', platforms: ['tiktok'] },
  google_business: { label: 'Google poslovni profil', platforms: ['google_business'] },
  youtube: { label: 'YouTube', platforms: ['youtube'] },
  pinterest: { label: 'Pinterest', platforms: ['pinterest'] },
  x: { label: 'X', platforms: ['x'] },
}

let metaOverride: MetaProvider | null = null
// zapis tipa iza dodele: oblik `linkedin…: <16 znakova>` gitleaks čita kao LinkedIn tajnu
let linkedinOverride = null as LinkedInProvider | null
let tiktokOverride: TikTokProvider | null = null
let googleBusinessOverride: GoogleBusinessProvider | null = null
let youtubeOverride: YouTubeProvider | null = null
let pinterestOverride: PinterestProvider | null = null
let xOverride: XProvider | null = null

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

export function getYouTubeProvider(): YouTubeProvider {
  return youtubeOverride ?? new YouTubeProvider()
}

export function getPinterestProvider(): PinterestProvider {
  return pinterestOverride ?? new PinterestProvider()
}

export function getXProvider(): XProvider {
  return xOverride ?? new XProvider()
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

export function setYouTubeProviderForTests(options: YouTubeProviderOptions | null): void {
  youtubeOverride = options ? new YouTubeProvider(options) : null
}

export function setPinterestProviderForTests(options: PinterestProviderOptions | null): void {
  pinterestOverride = options ? new PinterestProvider(options) : null
}

export function setXProviderForTests(options: XProviderOptions | null): void {
  xOverride = options ? new XProvider(options) : null
}

export function providerForKey(key: ConnectProviderKey): SocialProvider {
  switch (key) {
    case 'linkedin':
      return getLinkedInProvider()
    case 'tiktok':
      return getTikTokProvider()
    case 'google_business':
      return getGoogleBusinessProvider()
    case 'youtube':
      return getYouTubeProvider()
    case 'pinterest':
      return getPinterestProvider()
    case 'x':
      return getXProvider()
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
  if (provider === 'youtube') return 'youtube'
  if (provider === 'pinterest') return 'pinterest'
  if (provider === 'x') return 'x'
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
    case 'youtube':
      return YouTubeProvider.isConfigured()
    case 'pinterest':
      return PinterestProvider.isConfigured()
    case 'x':
      return XProvider.isConfigured()
    case 'meta':
      return MetaProvider.isConfigured()
  }
}
