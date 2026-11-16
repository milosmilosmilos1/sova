import 'server-only'

import type { SocialPlatform } from '@/config/platforms'
import { PROFILE_APPLY_LIVE } from '@/config/profile-apply'
import { isProviderError, providerToApiError } from '@/integrations/social/errors'
import { getGoogleBusinessProvider } from '@/integrations/social/registry'
import { PROFILE_FIELDS, type ProfileEntry } from '@/lib/ai/prompts/profile-bios'
import { EXTRAS_EDIT_LIMITS as L, EXTRAS_LIMITS, type ProfileExtras } from '@/lib/ai/prompts/profile-extras'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import {
  getProfileKit,
  storedKit,
  updateStoredKit,
  type ProfileKitView,
} from '@/services/brand-brain/profile-kit'
import { getBrand } from '@/services/brands'
import { refFor } from '@/services/social/account-rows'
import { accessTokenFor } from '@/services/social/tokens'

/**
 * Izmena i primena tekstova za profile (D-166). Opisi i dodaci se menjaju ručno, u granicama mreža.
 * Opis se upisuje na profil samo gde mreža to dozvoljava i gde Sova ima dozvolu (Google poslovni
 * profil); za ostale mreže ekran kopira tekst i otvara stranu za izmenu profila.
 */
const chars = (s: string) => Array.from(s).length
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/i
const clean = (s: string) => s.replace(/\r\n?/g, '\n').trim()

function tooLong(max: number): never {
  throw new ApiError('VALIDATION', `Tekst je duži od ${max} znakova, koliko mreža dozvoljava.`)
}

async function editableBrand(viewer: Viewer, brandId: string) {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  return brand
}

/** Opis jedne mreže posle ručne izmene: samo polja koja mreža ima, u njenim granicama. */
export async function saveProfileBio(
  viewer: Viewer,
  brandId: string,
  platform: SocialPlatform,
  entry: ProfileEntry,
): Promise<ProfileKitView> {
  const brand = await editableBrand(viewer, brandId)
  const limits = PROFILE_FIELDS[platform]
  const next: ProfileEntry = {}
  for (const field of ['name', 'short', 'long'] as const) {
    const max = limits[field]
    const value = entry[field]
    if (!max || value === undefined) continue
    const text = clean(value)
    if (chars(text) > max) tooLong(max)
    if (text) next[field] = text
  }
  if (limits.keywords && entry.keywords) {
    const words = [...new Set(entry.keywords.map((k) => clean(k).replace(/\s+/g, ' ')).filter(Boolean))]
    if (words.length > limits.keywords)
      throw new ApiError('VALIDATION', `Mreža prima najviše ${limits.keywords} ključnih reči.`)
    if (words.some((w) => chars(w) > 80)) tooLong(80)
    if (words.length) next.keywords = words
  }
  if (platform === 'google_business' && next.long && URL_RE.test(next.long))
    throw new ApiError('VALIDATION', 'Google ne dozvoljava linkove u opisu profila.')
  if (!storedKit(brand.settings).bios)
    throw new ApiError('VALIDATION', 'Prvo napravite opise profila, pa ih menjajte.')
  await updateStoredKit(brand.id, (kit) => {
    if (!kit.bios) return kit
    // izmenjen opis više nije onaj koji je upisan na profil
    const applied = { ...(kit.applied ?? {}) }
    delete applied[platform]
    return { ...kit, bios: { ...kit.bios, [platform]: next }, applied }
  })
  return getProfileKit(viewer, brand.id)
}

function check(text: string, max: number): string {
  const value = clean(text)
  if (chars(value) > max) tooLong(max)
  return value
}

/** Dodaci posle ručne izmene: isti broj stavki kao kod pisanja, granice mreža, bez praznih stavki. */
export async function saveProfileExtras(
  viewer: Viewer,
  brandId: string,
  extras: ProfileExtras,
): Promise<ProfileKitView> {
  const brand = await editableBrand(viewer, brandId)
  const C = EXTRAS_LIMITS
  const many = <T>(list: T[], max: number, map: (x: T) => T, keep: (x: T) => boolean) => {
    if (list.length > max) throw new ApiError('VALIDATION', `Najviše ${max} stavki u ovom delu.`)
    return list.map(map).filter(keep)
  }
  const next: ProfileExtras = {
    pinterest_boards: many(
      extras.pinterest_boards,
      C.boards.count,
      (b) => ({ name: check(b.name, L.boardName), description: check(b.description, L.boardDescription) }),
      (b) => Boolean(b.name),
    ),
    youtube_playlists: many(
      extras.youtube_playlists,
      C.playlists.count,
      (p) => ({
        title: check(p.title, L.playlistTitle),
        description: check(p.description, L.playlistDescription),
      }),
      (p) => Boolean(p.title),
    ),
    youtube_trailer: {
      hook: check(extras.youtube_trailer.hook, L.trailerHook),
      script: check(extras.youtube_trailer.script, L.trailerScript),
      cta: check(extras.youtube_trailer.cta, L.trailerCta),
    },
    google_services: many(
      extras.google_services,
      C.services.count,
      (s) => ({
        name: check(s.name, L.serviceName),
        description: check(s.description, L.serviceDescription),
      }),
      (s) => Boolean(s.name),
    ),
    ice_breakers: many(
      extras.ice_breakers,
      C.iceBreakers.count,
      (q) => ({ question: check(q.question, L.question), answer: check(q.answer, L.answer) }),
      (q) => Boolean(q.question),
    ),
    pinned_posts: many(
      extras.pinned_posts,
      C.pinned.count,
      (p) => ({
        title: check(p.title, L.pinnedTitle),
        why: check(p.why, L.pinnedWhy),
        text: check(p.text, L.pinnedText),
      }),
      (p) => Boolean(p.text),
    ),
  }
  if (next.google_services.some((s) => URL_RE.test(s.name) || URL_RE.test(s.description)))
    throw new ApiError('VALIDATION', 'Google ne dozvoljava linkove u opisu usluge.')
  if (!storedKit(brand.settings).extras)
    throw new ApiError('VALIDATION', 'Prvo napravite sadržaj za profile, pa ga menjajte.')
  await updateStoredKit(brand.id, (kit) => (kit.extras ? { ...kit, extras: next } : kit))
  return getProfileKit(viewer, brand.id)
}

/** Greška Google-a pri upisu opisa: bez odobrenog pristupa API-ju poslovnog profila je 403 ili 429. */
function gbpError(error: unknown): ApiError {
  if (isProviderError(error) && (error.status === 403 || error.status === 429))
    return new ApiError(
      'PROVIDER_ERROR',
      'Google je odbio izmenu: pristup API-ju poslovnog profila još nije odobren ili nalog nema prava na ovu lokaciju. Kopirajte opis i nalepite ga na profilu.',
      { cause: error },
    )
  return providerToApiError(error)
}

/**
 * Upis opisa na profil (D-166). Za sada samo Google poslovni profil: opis ide na svaku povezanu
 * lokaciju brenda. Ostale mreže ne dozvoljavaju upis ili Sova nema dozvolu (`config/profile-apply.ts`).
 */
export async function applyProfileBio(
  viewer: Viewer,
  brandId: string,
  platform: SocialPlatform,
): Promise<ProfileKitView> {
  const brand = await editableBrand(viewer, brandId)
  if (!PROFILE_APPLY_LIVE.includes(platform))
    throw new ApiError(
      'VALIDATION',
      'Ova mreža ne dozvoljava da Sova sama menja opis profila. Kopirajte tekst i nalepite ga na profilu.',
    )
  const text = storedKit(brand.settings).bios?.google_business.long?.trim()
  if (!text) throw new ApiError('VALIDATION', 'Opis za ovu mrežu je prazan.')
  const { data: rows, error } = await createSupabaseAdminClient()
    .from('social_accounts')
    .select('*')
    .eq('brand_id', brand.id)
    .eq('platform', platform)
    .eq('status', 'active')
  if (error) throw mapDbError(error)
  if (!rows?.length)
    throw new ApiError('VALIDATION', 'Ova mreža nije povezana za brend. Povežite je u Mrežama.')
  const provider = getGoogleBusinessProvider()
  try {
    for (const row of rows) await provider.updateDescription(refFor(row), await accessTokenFor(row), text)
  } catch (err) {
    throw gbpError(err)
  }
  const at = new Date().toISOString()
  await updateStoredKit(brand.id, (kit) => ({ ...kit, applied: { ...(kit.applied ?? {}), [platform]: at } }))
  return getProfileKit(viewer, brand.id)
}
