/**
 * Tipovi obaveštenja (brif 9): red u `notifications` uvek, email po podrazumevanoj vrednosti
 * koju korisnik menja u podešavanjima (`notification_preferences`, kanali in_app i email).
 */
export interface NotificationTypeDef {
  label: string
  description: string
  /** da li se email šalje kad korisnik nije ništa podesio */
  emailDefault: boolean
}

export const NOTIFICATION_TYPES = {
  post_review_requested: {
    label: 'Objava čeka odobrenje',
    description: 'Urednik je poslao objavu na odobravanje.',
    emailDefault: true,
  },
  post_approved: { label: 'Objava odobrena', description: 'Vaša objava je odobrena.', emailDefault: true },
  post_rejected: {
    label: 'Objava odbijena',
    description: 'Vaša objava je odbijena uz komentar.',
    emailDefault: true,
  },
  post_changes_requested: {
    label: 'Traže se izmene',
    description: 'Odobravalac traži izmene objave.',
    emailDefault: true,
  },
  post_published: {
    label: 'Objava objavljena',
    description: 'Objava je uspešno otišla na mrežu.',
    emailDefault: false,
  },
  post_failed: {
    label: 'Objava nije uspela',
    description: 'Mreža je odbila objavu ili su pokušaji potrošeni.',
    emailDefault: true,
  },
  post_needs_reauth: {
    label: 'Nalog traži ponovno povezivanje',
    description: 'Objava čeka jer je veza sa mrežom istekla.',
    emailDefault: true,
  },
  post_assisted_pending: {
    label: 'Ručno objavljivanje',
    description: 'Objava čeka da je neko ručno postavi na mrežu.',
    emailDefault: true,
  },
  post_rescheduled: {
    label: 'Objava pomerena',
    description: 'Termin je pomeren zbog dnevnog limita mreže.',
    emailDefault: true,
  },
  post_comment: {
    label: 'Nov komentar',
    description: 'Komentar člana tima ili klijenta na objavi.',
    emailDefault: false,
  },
  publish_watchdog_alarm: {
    label: 'Objava kasni',
    description: 'Zakazana objava kasni više od 15 minuta.',
    emailDefault: true,
  },
} as const satisfies Record<string, NotificationTypeDef>

export type NotificationType = keyof typeof NOTIFICATION_TYPES
export const NOTIFICATION_TYPE_KEYS = Object.keys(NOTIFICATION_TYPES) as NotificationType[]
export const NOTIFICATION_CHANNELS = ['in_app', 'email'] as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

export function isNotificationType(value: string): value is NotificationType {
  return value in NOTIFICATION_TYPES
}
