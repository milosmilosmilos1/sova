import type { AppLocale } from '@/i18n/config'

/**
 * Tekst mesečnog izveštaja na jeziku brenda (D-130): PDF, nazivi meseci i kratak pregled u mejlu.
 * Klijent dobija izveštaj na jeziku na kome brend objavljuje (ćirilica ide kao srpski latinicom).
 */
export interface ReportCopy {
  intl: string
  /** naziv fajla bez nastavka: izvestaj-brend-2026-10 */
  fileStem: string
  title: string
  docTitle: (brand: string, month: string) => string
  subject: (month: string) => string
  footer: (brand: string, date: string) => string
  page: (n: number, total: number) => string
  kpi: { posts: string; reach: string; impressions: string; engagement: string; rate: string }
  noComparison: string
  same: (previousMonth: string) => string
  /** „↑ 12 % u odnosu na septembar” (strelica i procenat dolaze spolja) */
  vs: (change: string, previousMonth: string) => string
  empty: string
  sections: {
    daily: string
    platforms: string
    topPosts: string
    pillars: string
    followers: string
    insights: string
  }
  notMeasured: string
  columns: {
    posts: string
    reach: string
    engagement: string
    rate: string
    date: string
    network: string
    post: string
    pillar: string
    account: string
    monthStart: string
    monthEnd: string
    change: string
  }
  accountFallback: string
  monthLabel: (year: number, month: number) => string
  /** mesec za poređenje, u obliku koji traži `vs` */
  monthForComparison: (month: number) => string
  summary: (posts: number, postsText: string, reach: string, engagement: string) => string
}

const SR_MONTHS = [
  'januar',
  'februar',
  'mart',
  'april',
  'maj',
  'jun',
  'jul',
  'avgust',
  'septembar',
  'oktobar',
  'novembar',
  'decembar',
]
/** ukrajinski mesec u instrumentalu („порівняно з вереснем”) */
const UK_MONTHS_WITH = [
  'січнем',
  'лютим',
  'березнем',
  'квітнем',
  'травнем',
  'червнем',
  'липнем',
  'серпнем',
  'вереснем',
  'жовтнем',
  'листопадом',
  'груднем',
]

const monthIntl = (intl: string, year: number, month: number) =>
  new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 15)),
  )

const slavic = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

export const REPORT_COPY: Record<AppLocale, ReportCopy> = {
  'sr-Latn': {
    intl: 'sr-Latn-RS',
    fileStem: 'izvestaj',
    title: 'Mesečni izveštaj',
    docTitle: (brand, month) => `Mesečni izveštaj · ${brand} · ${month}`,
    subject: (month) => `Društvene mreže za ${month}`,
    footer: (brand, date) => `Sova · ${brand} · napravljeno ${date}`,
    page: (n, total) => `strana ${n} od ${total}`,
    kpi: {
      posts: 'Objave',
      reach: 'Doseg',
      impressions: 'Prikazi',
      engagement: 'Angažovanje',
      rate: 'Stopa angažovanja',
    },
    noComparison: 'bez poređenja',
    same: (previousMonth) => `isto kao ${previousMonth}`,
    vs: (change, previousMonth) => `${change} u odnosu na ${previousMonth}`,
    empty: 'U ovom mesecu nije bilo objavljenih objava, pa nema dosega ni angažovanja za prikaz.',
    sections: {
      daily: 'Doseg po danu objave',
      platforms: 'Po mreži',
      topPosts: 'Najbolje objave',
      pillars: 'Stubovi sadržaja',
      followers: 'Pratioci',
      insights: 'Uvidi i preporuke',
    },
    notMeasured:
      'Doseg još nije izmeren: mreže ga daju sat vremena posle objave, pa posle 24 sata, 7 i 30 dana.',
    columns: {
      posts: 'Objave',
      reach: 'Doseg',
      engagement: 'Angažovanje',
      rate: 'Stopa',
      date: 'Datum',
      network: 'Mreža',
      post: 'Objava',
      pillar: 'Stub',
      account: 'Nalog',
      monthStart: 'Početak meseca',
      monthEnd: 'Kraj meseca',
      change: 'Promena',
    },
    accountFallback: 'Nalog',
    monthLabel: (year, month) => `${SR_MONTHS[month - 1]} ${year}.`,
    monthForComparison: (month) => SR_MONTHS[month - 1]!,
    summary: (posts, postsText, reach, engagement) =>
      `${postsText} ${slavic(posts, 'objava', 'objave', 'objava')}, doseg ${reach}, angažovanje ${engagement}`,
  },
  en: {
    intl: 'en-GB',
    fileStem: 'report',
    title: 'Monthly report',
    docTitle: (brand, month) => `Monthly report · ${brand} · ${month}`,
    subject: (month) => `Social media for ${month}`,
    footer: (brand, date) => `Sova · ${brand} · created ${date}`,
    page: (n, total) => `page ${n} of ${total}`,
    kpi: {
      posts: 'Posts',
      reach: 'Reach',
      impressions: 'Impressions',
      engagement: 'Engagement',
      rate: 'Engagement rate',
    },
    noComparison: 'no comparison',
    same: (previousMonth) => `same as ${previousMonth}`,
    vs: (change, previousMonth) => `${change} vs ${previousMonth}`,
    empty: 'No posts were published this month, so there is no reach or engagement to show.',
    sections: {
      daily: 'Reach by publishing day',
      platforms: 'By network',
      topPosts: 'Top posts',
      pillars: 'Content pillars',
      followers: 'Followers',
      insights: 'Insights and recommendations',
    },
    notMeasured:
      'Reach hasn’t been measured yet: networks report it an hour after posting, then after 24 hours, 7 and 30 days.',
    columns: {
      posts: 'Posts',
      reach: 'Reach',
      engagement: 'Engagement',
      rate: 'Rate',
      date: 'Date',
      network: 'Network',
      post: 'Post',
      pillar: 'Pillar',
      account: 'Account',
      monthStart: 'Start of month',
      monthEnd: 'End of month',
      change: 'Change',
    },
    accountFallback: 'Account',
    monthLabel: (year, month) => monthIntl('en-GB', year, month),
    monthForComparison: (month) =>
      new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(
        new Date(Date.UTC(2026, month - 1, 15)),
      ),
    summary: (posts, postsText, reach, engagement) =>
      `${postsText} ${posts === 1 ? 'post' : 'posts'}, reach ${reach}, engagement ${engagement}`,
  },
  uk: {
    intl: 'uk-UA',
    fileStem: 'zvit',
    title: 'Місячний звіт',
    docTitle: (brand, month) => `Місячний звіт · ${brand} · ${month}`,
    subject: (month) => `Соцмережі за ${month}`,
    footer: (brand, date) => `Sova · ${brand} · створено ${date}`,
    page: (n, total) => `сторінка ${n} з ${total}`,
    kpi: {
      posts: 'Дописи',
      reach: 'Охоплення',
      impressions: 'Покази',
      engagement: 'Залученість',
      rate: 'Рівень залученості',
    },
    noComparison: 'без порівняння',
    same: (previousMonth) => `без змін порівняно з ${previousMonth}`,
    vs: (change, previousMonth) => `${change} порівняно з ${previousMonth}`,
    empty: 'Цього місяця не було опублікованих дописів, тож немає охоплення чи залученості для показу.',
    sections: {
      daily: 'Охоплення за днем публікації',
      platforms: 'За мережами',
      topPosts: 'Найкращі дописи',
      pillars: 'Стовпи контенту',
      followers: 'Підписники',
      insights: 'Інсайти й рекомендації',
    },
    notMeasured:
      'Охоплення ще не виміряно: мережі повідомляють його через годину після публікації, потім через 24 години, 7 і 30 днів.',
    columns: {
      posts: 'Дописи',
      reach: 'Охоплення',
      engagement: 'Залученість',
      rate: 'Рівень',
      date: 'Дата',
      network: 'Мережа',
      post: 'Допис',
      pillar: 'Стовп',
      account: 'Акаунт',
      monthStart: 'Початок місяця',
      monthEnd: 'Кінець місяця',
      change: 'Зміна',
    },
    accountFallback: 'Акаунт',
    monthLabel: (year, month) => monthIntl('uk-UA', year, month),
    monthForComparison: (month) => UK_MONTHS_WITH[month - 1]!,
    summary: (posts, postsText, reach, engagement) =>
      `${postsText} ${slavic(posts, 'допис', 'дописи', 'дописів')}, охоплення ${reach}, залученість ${engagement}`,
  },
}
