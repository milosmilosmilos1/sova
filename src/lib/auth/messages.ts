/** Mapiranje poruka Supabase Auth-a na razumljiv srpski. */
export function authErrorMessage(
  message: string | undefined,
  fallback = 'Nešto nije u redu. Pokušajte ponovo.',
): string {
  const m = (message ?? '').toLowerCase()
  if (m.includes('invalid login credentials')) return 'Pogrešan email ili lozinka.'
  if (m.includes('email not confirmed')) return 'Potvrdite email adresu pre prijave. Proverite poštu.'
  if (m.includes('user already registered') || m.includes('already been registered'))
    return 'Ako nalog postoji, poslali smo uputstvo na email.'
  if (m.includes('rate limit') || m.includes('too many requests'))
    return 'Previše pokušaja. Sačekajte malo pa pokušajte ponovo.'
  if (m.includes('password should be at least') || m.includes('password is too short'))
    return 'Lozinka mora imati najmanje 10 karaktera.'
  if (m.includes('weak password') || m.includes('easy to guess'))
    return 'Lozinka je previše jednostavna. Izaberite dužu i manje predvidivu.'
  if (m.includes('invalid') && m.includes('token')) return 'Link je nevažeći ili je istekao. Zatražite nov.'
  if (m.includes('expired')) return 'Link je istekao. Zatražite nov.'
  if (m.includes('signups not allowed') || m.includes('signup is disabled'))
    return 'Registracija je trenutno zatvorena.'
  if (m.includes('same password') || m.includes('different from the old password'))
    return 'Nova lozinka mora biti drugačija od stare.'
  if (m.includes('session') && m.includes('missing')) return 'Sesija je istekla. Prijavite se ponovo.'
  return fallback
}
