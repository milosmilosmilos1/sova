import type { SocialPlatform } from '@/config/platforms'

/**
 * Naslovne slike profila (D-145): Facebook, LinkedIn (stranica firme i lični profil), X, YouTube i
 * Pinterest, svaka u veličini koju mreža traži. Tekst stoji u delu koji se vidi na svakom uređaju
 * (`safe`), a ne ispod slike profila ili logoa koji prekrivaju donji levi ugao. Profilna slika (D-147) je
 * jedna za sve mreže: logo ili početna slova brenda u krugu koji svaka mreža iseca iz sredine.
 */
export const COVER_KINDS = [
  'facebook',
  'linkedin_page',
  'linkedin_profile',
  'x',
  'youtube',
  'pinterest',
] as const
export const BANNER_KINDS = ['avatar', ...COVER_KINDS] as const
export type BannerKind = (typeof BANNER_KINDS)[number]

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export const PROFILE_BANNERS: Record<
  BannerKind,
  { platform: SocialPlatform | null; width: number; height: number; safe: Rect; align: 'center' | 'end' }
> = {
  // svaka mreža seče krug iz sredine; logo stoji u kvadratu upisanom u taj krug
  avatar: {
    platform: null,
    width: 1080,
    height: 1080,
    safe: { x: 158, y: 158, width: 764, height: 764 },
    align: 'center',
  },
  // računar prikazuje 1640×624 (seče gore i dole), telefon 1522×856 (seče levo i desno)
  facebook: {
    platform: 'facebook',
    width: 1640,
    height: 856,
    safe: { x: 160, y: 156, width: 1320, height: 544 },
    align: 'center',
  },
  // logo firme prekriva donji levi ugao
  linkedin_page: {
    platform: 'linkedin',
    width: 1128,
    height: 191,
    safe: { x: 300, y: 22, width: 788, height: 147 },
    align: 'end',
  },
  // slika profila prekriva levu trećinu odozdo
  linkedin_profile: {
    platform: 'linkedin',
    width: 1584,
    height: 396,
    safe: { x: 560, y: 48, width: 960, height: 300 },
    align: 'end',
  },
  // slika profila je dole levo, a telefon seče traku gore i dole
  x: {
    platform: 'x',
    width: 1500,
    height: 500,
    safe: { x: 520, y: 80, width: 920, height: 340 },
    align: 'end',
  },
  // na svakom uređaju se vidi samo traka 1546×423 u sredini
  youtube: {
    platform: 'youtube',
    width: 2560,
    height: 1440,
    safe: { x: 507, y: 508, width: 1546, height: 423 },
    align: 'center',
  },
  // slika profila je dole u sredini
  pinterest: {
    platform: 'pinterest',
    width: 1600,
    height: 900,
    safe: { x: 200, y: 110, width: 1200, height: 460 },
    align: 'center',
  },
}

/** najviše znakova po polju teksta naslovne */
export const BANNER_TEXT_LIMITS = { title: 60, subtitle: 120, footer: 60 } as const
