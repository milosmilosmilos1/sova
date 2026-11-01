import type { AppLocale } from '@/i18n/config'

/**
 * Tekst mejlova na jeziku primaoca (D-130): obaveštenje, pozivnica i mesečni izveštaj. Jezik je iz
 * profila primaoca; pozivnica ide na jeziku onoga ko poziva, a izveštaj na jeziku brenda.
 */
export interface EmailCopy {
  htmlLang: string
  hello: (name: string) => string
  openInSova: string
  roles: Record<string, string>
  invitePreview: (inviter: string, workspace: string) => string
  /** tekst pre i posle imena radnog prostora (ime je podebljano) */
  inviteLead: (inviter: string) => string
  inviteRole: (role: string) => string
  inviteExpires: (days: number) => string
  inviteAccept: string
  inviteIgnore: (url: string) => string
  reportPreview: (brand: string, month: string) => string
  reportHeading: (month: string) => string
  reportBody: (brand: string) => string
  reportSummary: (summary: string) => string
  reportFooter: string
}

const slavic = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

export const EMAIL_COPY: Record<AppLocale, EmailCopy> = {
  'sr-Latn': {
    htmlLang: 'sr-Latn',
    hello: (name) => `Zdravo, ${name}.`,
    openInSova: 'Otvori u Sovi',
    roles: { admin: 'administrator', editor: 'urednik', approver: 'odobravalac', viewer: 'posmatrač' },
    invitePreview: (inviter, workspace) => `${inviter} vas poziva u radni prostor ${workspace}`,
    inviteLead: (inviter) => `${inviter} vas poziva da se pridružite radnom prostoru `,
    inviteRole: (role) => ` u Sovi kao ${role}.`,
    inviteExpires: (days) => `Kliknite na dugme da prihvatite pozivnicu. Link važi ${days} dana.`,
    inviteAccept: 'Prihvati pozivnicu',
    inviteIgnore: (url) => `Ako ne očekujete ovu pozivnicu, slobodno zanemarite poruku. Link: ${url}`,
    reportPreview: (brand, month) => `${brand}: izveštaj o društvenim mrežama za ${month}`,
    reportHeading: (month) => `Izveštaj za ${month}`,
    reportBody: (brand) =>
      `U prilogu je PDF izveštaj o društvenim mrežama za ${brand}: objave, doseg, angažovanje, najbolje objave i preporuke za sledeći mesec.`,
    reportSummary: (summary) => `Ukratko: ${summary}.`,
    reportFooter:
      'Ovu poruku dobijate jer je vaša adresa upisana kao primalac mesečnog izveštaja. Ako više ne želite da ga dobijate, javite se osobi koja vodi vaše društvene mreže.',
  },
  en: {
    htmlLang: 'en',
    hello: (name) => `Hi ${name},`,
    openInSova: 'Open in Sova',
    roles: { admin: 'an admin', editor: 'an editor', approver: 'an approver', viewer: 'a viewer' },
    invitePreview: (inviter, workspace) => `${inviter} is inviting you to the ${workspace} workspace`,
    inviteLead: (inviter) => `${inviter} is inviting you to join the workspace `,
    inviteRole: (role) => ` in Sova as ${role}.`,
    inviteExpires: (days) =>
      `Click the button to accept the invitation. The link is valid for ${days} ${days === 1 ? 'day' : 'days'}.`,
    inviteAccept: 'Accept invitation',
    inviteIgnore: (url) =>
      `If you weren't expecting this invitation, you can ignore this email. Link: ${url}`,
    reportPreview: (brand, month) => `${brand}: social media report for ${month}`,
    reportHeading: (month) => `Report for ${month}`,
    reportBody: (brand) =>
      `Attached is the PDF social media report for ${brand}: posts, reach, engagement, top posts and recommendations for next month.`,
    reportSummary: (summary) => `In short: ${summary}.`,
    reportFooter:
      "You're receiving this email because your address was added as a recipient of the monthly report. If you no longer want to receive it, contact the person who runs your social media.",
  },
  uk: {
    htmlLang: 'uk',
    hello: (name) => `Вітаємо, ${name}!`,
    openInSova: 'Відкрити в Sova',
    roles: { admin: 'адміністратор', editor: 'редактор', approver: 'погоджувач', viewer: 'спостерігач' },
    invitePreview: (inviter, workspace) => `${inviter} запрошує вас до робочого простору ${workspace}`,
    inviteLead: (inviter) => `${inviter} запрошує вас приєднатися до робочого простору `,
    inviteRole: (role) => ` у Sova з роллю «${role}».`,
    inviteExpires: (days) =>
      `Натисніть кнопку, щоб прийняти запрошення. Посилання дійсне ${days} ${slavic(days, 'день', 'дні', 'днів')}.`,
    inviteAccept: 'Прийняти запрошення',
    inviteIgnore: (url) =>
      `Якщо ви не очікували цього запрошення, просто проігноруйте лист. Посилання: ${url}`,
    reportPreview: (brand, month) => `${brand}: звіт про соцмережі за ${month}`,
    reportHeading: (month) => `Звіт за ${month}`,
    reportBody: (brand) =>
      `У вкладенні — PDF-звіт про соцмережі для ${brand}: дописи, охоплення, залученість, найкращі дописи й рекомендації на наступний місяць.`,
    reportSummary: (summary) => `Коротко: ${summary}.`,
    reportFooter:
      'Ви отримуєте цей лист, бо вашу адресу вказано як отримувача місячного звіту. Якщо більше не хочете його отримувати, зверніться до людини, яка веде ваші соцмережі.',
  },
}
