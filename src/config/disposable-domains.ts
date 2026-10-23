/**
 * Najčešći domeni za jednokratne email adrese. Namerno kratka lista (zaštita
 * besplatnih tokena, brif 15.3); puna lista bi se održavala kao platform_setting.
 */
export const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  '10minutemail.net',
  '20minutemail.com',
  '33mail.com',
  'anonbox.net',
  'burnermail.io',
  'dispostable.com',
  'emailondeck.com',
  'fakeinbox.com',
  'getairmail.com',
  'getnada.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'inboxkitten.com',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'mailsac.com',
  'mintemail.com',
  'mohmal.com',
  'mytemp.email',
  'sharklasers.com',
  'spamgourmet.com',
  'temp-mail.org',
  'tempmail.com',
  'tempmail.net',
  'tempmailo.com',
  'tempr.email',
  'throwawaymail.com',
  'trashmail.com',
  'trashmail.me',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
])

export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf('@')
  if (at === -1) return false
  const domain = email.slice(at + 1).toLowerCase()
  if (DISPOSABLE_DOMAINS.has(domain)) return true
  const parts = domain.split('.')
  return parts.length > 2 && DISPOSABLE_DOMAINS.has(parts.slice(-2).join('.'))
}
