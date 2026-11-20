/**
 * Stalne reči šablona (D-175) na jeziku objava: oznake na slajdovima i kratke rečenice u opisu.
 * {0}, {1} su podaci koje je korisnik upisao; ćirilica nastaje prevodom latinice, a podaci se ne
 * prevode (naziv firme ostaje kako je napisan).
 */
export interface Phrases {
  team: string
  funFact: string
  teamIntro: string
  testimonial: string
  thanksTrust: string
  before: string
  after: string
  beforeAfter: string
  leftRight: string
  firstSecond: string
  caseStudy: string
  challenge: string
  whatWeDid: string
  result: string
  behindScenes: string
  quiz: string
  correctAnswer: string
  quizCarousel: string
  quizStory: string
  poll: string
  pollVote: string
  faq: string
  faqTitle: string
  question: string
  giveaway: string
  howToEnter: string
  deadline: string
  rules: string
  until: string
  offer: string
  validUntil: string
  code: string
  launch: string
  where: string
  priceList: string
  event: string
  when: string
  milestone: string
  thanksAll: string
  hiring: string
  weOffer: string
  weLookFor: string
  howToApply: string
  applyUntil: string
  announcement: string
  award: string
  thanksClients: string
  partnership: string
  ctaFallback: string
}

export const PHRASES: Record<'sr-Latn' | 'en', Phrases> = {
  'sr-Latn': {
    team: 'Upoznajte tim',
    funFact: 'Zanimljivost',
    teamIntro: 'Ovo je {0}, {1}.',
    testimonial: 'Utisak klijenta',
    thanksTrust: 'Hvala na poverenju.',
    before: 'Pre',
    after: 'Posle',
    beforeAfter: 'Pre i posle',
    leftRight: 'Levo je stanje pre, desno posle.',
    firstSecond: 'Prvi slajd je stanje pre, drugi posle.',
    caseStudy: 'Rezultat za klijenta',
    challenge: 'Izazov',
    whatWeDid: 'Šta smo uradili',
    result: 'Rezultat',
    behindScenes: 'Iza kulisa',
    quiz: 'Kviz',
    correctAnswer: 'Tačan odgovor',
    quizCarousel: 'Napišite slovo u komentaru, pa prevucite do tačnog odgovora.',
    quizStory: 'Tačan odgovor je na sledećem kadru.',
    poll: 'Anketa',
    pollVote: 'Glasajte u komentarima: napišite broj odgovora.',
    faq: 'Česta pitanja',
    faqTitle: 'Odgovori na pitanja koja nam najčešće postavljate',
    question: 'Pitanje {0}',
    giveaway: 'Nagradna igra',
    howToEnter: 'Kako učestvujete',
    deadline: 'Rok',
    rules: 'Pravila',
    until: 'Do {0}',
    offer: 'Akcija',
    validUntil: 'Važi do {0}',
    code: 'Kod za popust',
    launch: 'Novo',
    where: 'Gde',
    priceList: 'Cenovnik',
    event: 'Događaj',
    when: 'Kada',
    milestone: 'Jubilej',
    thanksAll: 'Hvala svima koji su bili uz nas.',
    hiring: 'Zapošljavamo',
    weOffer: 'Šta nudimo',
    weLookFor: 'Koga tražimo',
    howToApply: 'Kako se prijavljujete',
    applyUntil: 'Prijave do {0}',
    announcement: 'Obaveštenje',
    award: 'Nagrada',
    thanksClients: 'Hvala klijentima i timu.',
    partnership: 'Nova saradnja',
    ctaFallback: 'Pišite nam',
  },
  en: {
    team: 'Meet the team',
    funFact: 'Fun fact',
    teamIntro: 'This is {0}, {1}.',
    testimonial: 'Client review',
    thanksTrust: 'Thank you for your trust.',
    before: 'Before',
    after: 'After',
    beforeAfter: 'Before and after',
    leftRight: 'Before on the left, after on the right.',
    firstSecond: 'The first slide is before, the second is after.',
    caseStudy: 'Client result',
    challenge: 'The challenge',
    whatWeDid: 'What we did',
    result: 'The result',
    behindScenes: 'Behind the scenes',
    quiz: 'Quiz',
    correctAnswer: 'Correct answer',
    quizCarousel: 'Comment with a letter, then swipe to see the answer.',
    quizStory: 'The answer is on the next frame.',
    poll: 'Poll',
    pollVote: 'Vote in the comments: write the number of your answer.',
    faq: 'FAQ',
    faqTitle: 'Answers to the questions you ask us most',
    question: 'Question {0}',
    giveaway: 'Giveaway',
    howToEnter: 'How to enter',
    deadline: 'Deadline',
    rules: 'Rules',
    until: 'Until {0}',
    offer: 'Offer',
    validUntil: 'Valid until {0}',
    code: 'Discount code',
    launch: 'New',
    where: 'Where',
    priceList: 'Price list',
    event: 'Event',
    when: 'When',
    milestone: 'Milestone',
    thanksAll: 'Thank you to everyone who has been with us.',
    hiring: 'We’re hiring',
    weOffer: 'What we offer',
    weLookFor: 'Who we’re looking for',
    howToApply: 'How to apply',
    applyUntil: 'Apply by {0}',
    announcement: 'Notice',
    award: 'Award',
    thanksClients: 'Thank you to our clients and our team.',
    partnership: 'New partnership',
    ctaFallback: 'Get in touch',
  },
}

/** Popunjava {0}, {1}… podacima. */
export function fill(template: string, ...args: Array<string | number>): string {
  return template.replace(/\{(\d+)\}/g, (whole, i: string) => String(args[Number(i)] ?? whole))
}

const DIGRAPHS: Array<[RegExp, string]> = [
  [/DŽ|Dž/g, 'Џ'],
  [/dž/g, 'џ'],
  [/LJ|Lj/g, 'Љ'],
  [/lj/g, 'љ'],
  [/NJ|Nj/g, 'Њ'],
  [/nj/g, 'њ'],
]
const LETTERS: Record<string, string> = {
  a: 'а',
  b: 'б',
  v: 'в',
  g: 'г',
  d: 'д',
  đ: 'ђ',
  e: 'е',
  ž: 'ж',
  z: 'з',
  i: 'и',
  j: 'ј',
  k: 'к',
  l: 'л',
  m: 'м',
  n: 'н',
  o: 'о',
  p: 'п',
  r: 'р',
  s: 'с',
  t: 'т',
  ć: 'ћ',
  u: 'у',
  f: 'ф',
  h: 'х',
  c: 'ц',
  č: 'ч',
  š: 'ш',
}

/** Srpska latinica u ćirilicu (samo stalne reči šablona; podaci korisnika se ne diraju). */
export function toCyrillic(text: string): string {
  let out = text
  for (const [re, to] of DIGRAPHS) out = out.replace(re, to)
  return out.replace(/[a-zA-ZđžćčšĐŽĆČŠ]/g, (ch) => {
    const lower = ch.toLowerCase()
    const mapped = LETTERS[lower]
    if (!mapped) return ch
    return ch === lower ? mapped : mapped.toUpperCase()
  })
}
