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
  workspace_ownership: {
    label: 'Vlasništvo radnog prostora',
    description: 'Neko vam je preneo vlasništvo nad radnim prostorom.',
    emailDefault: true,
  },
  account_expiring: {
    label: 'Veza sa mrežom ističe',
    description: 'LinkedIn veza traje 60 dana; povežite nalog ponovo pre isteka.',
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
  insights_ready: {
    label: 'Novi uvidi iz analitike',
    description: 'Nedeljni AI uvidi i predlozi za Inbox su spremni.',
    emailDefault: true,
  },
  autopilot_returned: {
    label: 'Autopilot vratio objavu',
    description: 'Nacrt nije prošao kontrolu kvaliteta i čeka doradu.',
    emailDefault: false,
  },
  autopilot_deadline: {
    label: 'Rok za odobrenje',
    description: 'Autopilot objava čeka odobrenje ili je zakazana posle roka.',
    emailDefault: true,
  },
  autopilot_skipped: {
    label: 'Autopilot objava preskočena',
    description: 'Objava nije odobrena na vreme ili je termin prošao.',
    emailDefault: true,
  },
  autopilot_budget_warning: {
    label: 'Budžet Autopilota 80 %',
    description: 'Autopilot je potrošio veći deo mesečnog budžeta tokena.',
    emailDefault: true,
  },
  autopilot_budget_stopped: {
    label: 'Budžet Autopilota potrošen',
    description: 'Autopilot je stao do sledećeg meseca ili povećanja budžeta.',
    emailDefault: true,
  },
  autopilot_weekly_report: {
    label: 'Nedeljni izveštaj Autopilota',
    description: 'Šta je objavljeno, rezultati i plan za narednu nedelju.',
    emailDefault: true,
  },
  autopilot_strategy: {
    label: 'Autopilot i strategija',
    description: 'Nova strategija ili Autopilot čeka strategiju.',
    emailDefault: true,
  },
  publish_watchdog_alarm: {
    label: 'Objava kasni',
    description: 'Zakazana objava kasni više od 15 minuta.',
    emailDefault: true,
  },
  billing_payment_failed: {
    label: 'Plaćanje nije uspelo',
    description: 'Kartica je odbijena pri obnovi pretplate; podsetnici do kraja roka.',
    emailDefault: true,
  },
  billing_subscription: {
    label: 'Pretplata',
    description: 'Pretplata je aktivirana, otkazana ili je završena.',
    emailDefault: true,
  },
  billing_tokens: {
    label: 'Dopuna tokena',
    description: 'Kupljeni tokeni su stigli na stanje.',
    emailDefault: false,
  },
} as const satisfies Record<string, NotificationTypeDef>

export type NotificationType = keyof typeof NOTIFICATION_TYPES
export const NOTIFICATION_TYPE_KEYS = Object.keys(NOTIFICATION_TYPES) as NotificationType[]
export const NOTIFICATION_CHANNELS = ['in_app', 'email'] as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

export function isNotificationType(value: string): value is NotificationType {
  return value in NOTIFICATION_TYPES
}
