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
 * Mreže na javnom sajtu (D-098): tekstovi i formati iz dizajna, primer brenda „Pekara Zrno”
 * je izmišljen. Granica dužine teksta je ista kao u proveri objave (`src/config/platforms.ts`),
 * osim za YouTube Shorts, gde se prikazuje naslov (do 100 znakova).
 */
export interface LandingPlatform {
  key: SocialPlatform
  name: string
  /** null = Googleov „G” na beloj pločici */
  icon: IconDefinition | null
  /** pozadina pločice; `ig` je Instagram gradijent iz klase `.l-ig` */
  tile: string | 'ig'
  /** tanak svetli okvir za crne pločice (TikTok, X) */
  ring?: boolean
  /** boja znaka u zaglavlju kartice objave */
  brand: string
  format: string
  tags: string
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
  handle: string
  actions?: string
  videoTop?: string
  note: string
  caption: string
}

export const LANDING_PLATFORMS: LandingPlatform[] = [
  {
    key: 'instagram',
    name: 'Instagram',
    icon: faInstagram,
    tile: 'ig',
    brand: '#E1306C',
    format: '4:5 · fotografija',
    tags: '4 hashtaga',
    limit: RULES.instagram.textMax,
    layout: 'feed',
    image: '/landing/kroasani.jpg',
    imageHeight: 400,
    handle: 'pekarazrno · Novi Sad',
    actions: 'Sviđa mi se · Komentariši · Podeli',
    note: 'Duži opis, 4 hashtaga na kraju i kadar 4:5 koji zauzima ceo ekran.',
    caption:
      'Jutro počinje mirisom. Kroasani sa francuskim puterom izlaze iz peći u 7:00 – dođite dok su topli.\n\n#novisad #pekara #kroasan #doručak',
  },
  {
    key: 'facebook',
    name: 'Facebook',
    icon: faFacebookF,
    tile: '#0866FF',
    brand: '#0866FF',
    format: '1,91:1 · fotografija',
    tags: 'bez hashtagova',
    limit: RULES.facebook.textMax,
    layout: 'feed',
    image: '/landing/pekara-izlog.jpg',
    imageHeight: 230,
    handle: 'Pekara Zrno · pre 2 min',
    actions: 'Sviđa mi se · Komentar · Podeli',
    note: 'Kraći tekst, poziv da rezervišete porukom, bez hashtagova.',
    caption:
      'Novo u Zrnu: kroasani sa francuskim puterom, svako jutro od 7:00. Rezervišite svoje porukom, čuvamo ih do 10h.',
  },
  {
    key: 'linkedin',
    name: 'LinkedIn',
    icon: faLinkedinIn,
    tile: '#0A66C2',
    brand: '#0A66C2',
    format: '1,91:1 · fotografija',
    tags: '3 hashtaga',
    limit: RULES.linkedin.textMax,
    layout: 'feed',
    image: '/landing/vitrina.jpg',
    imageHeight: 230,
    handle: 'Pekara Zrno · 1.204 pratioca',
    actions: 'Preporuči · Komentariši · Podeli',
    note: 'Priča iza posla, profesionalniji ton i 3 hashtaga.',
    caption:
      'Iza svakog kroasana stoji 36 sati rada. Ovog meseca uveli smo francuski puter i novi raspored pečenja, pa prva tura stiže već u 7:00.\n\nMala pekara, veliki standardi. #zanat #novisad #preduzetništvo',
  },
  {
    key: 'tiktok',
    name: 'TikTok',
    icon: faTiktok,
    tile: '#000000',
    ring: true,
    brand: '#000000',
    format: '9:16 · video',
    tags: '3 hashtaga',
    limit: RULES.tiktok.textMax,
    layout: 'video',
    image: '/landing/testo.jpg',
    handle: '@pekarazrno',
    videoTop: 'Za vas',
    note: 'Udica u prvoj sekundi, kratak tekst preko vertikalnog videa.',
    caption: '36 sati za jedan kroasan. Gledajte do kraja. #pekara #novisad #kroasan',
  },
  {
    key: 'x',
    name: 'X',
    icon: faXTwitter,
    tile: '#000000',
    ring: true,
    brand: '#0F1419',
    format: '16:9 · tekst i slika',
    tags: 'bez hashtagova',
    limit: RULES.x.textMax,
    layout: 'feed',
    image: '/landing/kafa.jpg',
    imageHeight: 200,
    imagePad: '0 16px',
    imageRadius: 14,
    handle: '@pekarazrno · 2 min',
    actions: 'Odgovori · Repost · Sviđa mi se',
    note: 'Skraćeno da stane u 280 znakova, sa malo humora.',
    caption: 'Kroasani sa francuskim puterom, topli od 7:00. Ko stigne pre 8, kafa je na nama.',
  },
  {
    key: 'youtube',
    name: 'YouTube Shorts',
    icon: faYoutube,
    tile: '#FF0000',
    brand: '#FF0000',
    format: '9:16 · video',
    tags: '#Shorts',
    limit: 100,
    layout: 'video',
    image: '/landing/kroasani-pec.jpg',
    handle: 'Pekara Zrno',
    videoTop: 'Shorts',
    note: 'Naslov do 100 znakova sa oznakom #Shorts.',
    caption: 'Kako nastaje kroasan: 36 sati za 30 sekundi #Shorts',
  },
  {
    key: 'pinterest',
    name: 'Pinterest',
    icon: faPinterestP,
    tile: '#E60023',
    brand: '#E60023',
    format: '2:3 · pin',
    tags: 'ključne reči',
    limit: RULES.pinterest.textMax,
    layout: 'feed',
    image: '/landing/hleb-secen.jpg',
    imageHeight: 380,
    imagePad: '0 12px',
    imageRadius: 16,
    captionAfter: true,
    handle: 'Pekara Zrno · Recepti',
    actions: 'Sačuvaj · Podeli',
    note: 'Opisni naslov sa ključnim rečima koje ljudi traže.',
    caption: 'Domaći hleb na kvascu: recept i saveti iz Pekare Zrno',
  },
  {
    key: 'google_business',
    name: 'Google poslovni profil',
    icon: null,
    tile: '#FFFFFF',
    brand: '#1A73E8',
    format: '4:3 · novost',
    tags: 'bez hashtagova',
    limit: RULES.google_business.textMax,
    layout: 'feed',
    image: '/landing/kafic.jpg',
    imageHeight: 210,
    cta: true,
    handle: 'Bulevar oslobođenja 42, Novi Sad',
    actions: 'Ocena 4,8 · 312 recenzija',
    note: 'Praktične informacije, radno vreme i dugme za poziv.',
    caption:
      'Kroasani sa francuskim puterom, svako jutro od 7:00. Radno vreme: 6:30–20:00, nedeljom do 14:00.',
  },
]

export const byKey = (key: SocialPlatform): LandingPlatform => LANDING_PLATFORMS.find((p) => p.key === key)!
