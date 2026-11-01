import {
  faFacebookF,
  faInstagram,
  faLinkedinIn,
  faPinterestP,
  faTiktok,
  faXTwitter,
  faYoutube,
} from '@fortawesome/free-brands-svg-icons'
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons'

import { PLATFORMS as RULES, type SocialPlatform } from '@/config/platforms'

/**
 * Mreže na javnom sajtu (D-098): formati iz dizajna, primer brenda „Pekara Zrno” je izmišljen.
 * Tekstovi (naziv, format, nalog, opis objave…) su u porukama `site.platforms.<mreža>`, na jeziku
 * strane (D-130); ovde je samo izgled kartice. Granica dužine teksta je ista kao u proveri objave
 * (`src/config/platforms.ts`), osim za YouTube Shorts, gde se prikazuje naslov (do 100 znakova).
 */
export interface LandingPlatform {
  key: SocialPlatform
  /** null = Googleov „G” na beloj pločici */
  icon: IconDefinition | null
  /** pozadina pločice; `ig` je Instagram gradijent iz klase `.l-ig` */
  tile: string | 'ig'
  /** tanak svetli okvir za crne pločice (TikTok, X) */
  ring?: boolean
  /** boja znaka u zaglavlju kartice objave */
  brand: string
  limit: number
  layout: 'feed' | 'video'
  image: string
  imageHeight?: number
  imagePad?: string
  imageRadius?: number
  /** Pinterest: tekst ispod slike, podebljan */
  captionAfter?: boolean
  /** Google: dugme „Pozovite” */
  cta?: boolean
}

export const LANDING_PLATFORMS: LandingPlatform[] = [
  {
    key: 'instagram',
    icon: faInstagram,
    tile: 'ig',
    brand: '#E1306C',
    limit: RULES.instagram.textMax,
    layout: 'feed',
    image: '/landing/kroasani.jpg',
    imageHeight: 400,
  },
  {
    key: 'facebook',
    icon: faFacebookF,
    tile: '#0866FF',
    brand: '#0866FF',
    limit: RULES.facebook.textMax,
    layout: 'feed',
    image: '/landing/pekara-izlog.jpg',
    imageHeight: 230,
  },
  {
    key: 'linkedin',
    icon: faLinkedinIn,
    tile: '#0A66C2',
    brand: '#0A66C2',
    limit: RULES.linkedin.textMax,
    layout: 'feed',
    image: '/landing/vitrina.jpg',
    imageHeight: 230,
  },
  {
    key: 'tiktok',
    icon: faTiktok,
    tile: '#000000',
    ring: true,
    brand: '#000000',
    limit: RULES.tiktok.textMax,
    layout: 'video',
    image: '/landing/testo.jpg',
  },
  {
    key: 'x',
    icon: faXTwitter,
    tile: '#000000',
    ring: true,
    brand: '#0F1419',
    limit: RULES.x.textMax,
    layout: 'feed',
    image: '/landing/kafa.jpg',
    imageHeight: 200,
    imagePad: '0 16px',
    imageRadius: 14,
  },
  {
    key: 'youtube',
    icon: faYoutube,
    tile: '#FF0000',
    brand: '#FF0000',
    limit: 100,
    layout: 'video',
    image: '/landing/kroasani-pec.jpg',
  },
  {
    key: 'pinterest',
    icon: faPinterestP,
    tile: '#E60023',
    brand: '#E60023',
    limit: RULES.pinterest.textMax,
    layout: 'feed',
    image: '/landing/hleb-secen.jpg',
    imageHeight: 380,
    imagePad: '0 12px',
    imageRadius: 16,
    captionAfter: true,
  },
  {
    key: 'google_business',
    icon: null,
    tile: '#FFFFFF',
    brand: '#1A73E8',
    limit: RULES.google_business.textMax,
    layout: 'feed',
    image: '/landing/kafic.jpg',
    imageHeight: 210,
    cta: true,
  },
]

export const byKey = (key: SocialPlatform): LandingPlatform => LANDING_PLATFORMS.find((p) => p.key === key)!
