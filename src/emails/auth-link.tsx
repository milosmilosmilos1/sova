import { Button, Heading, Text } from '@react-email/components'

import type { AppLocale } from '@/i18n/config'

import { EMAIL_COPY } from './copy'
import { emailButton, emailText, EmailLayout } from './layout'

/** Mejlovi za nalog koje Sova šalje sama (D-187): potvrda adrese, prijava linkom, nova lozinka. */
export type AuthLinkKind = 'confirm' | 'login' | 'recovery'

interface AuthCopy {
  subject: string
  heading: string
  body: string
  cta: string
  ignore: string
  fallback: string
}

export const AUTH_LINK_COPY: Record<AppLocale, Record<AuthLinkKind, AuthCopy>> = {
  'sr-Latn': {
    confirm: {
      subject: 'Potvrdite email adresu za Sovu',
      heading: 'Potvrdite email adresu',
      body: 'Kliknite na dugme da potvrdite adresu i aktivirate nalog u Sovi.',
      cta: 'Potvrdi email',
      ignore: 'Ako niste vi napravili nalog, slobodno zanemarite ovu poruku.',
      fallback: 'Ako dugme ne radi, otvorite ovaj link:',
    },
    login: {
      subject: 'Link za prijavu u Sovu',
      heading: 'Prijava u Sovu',
      body: 'Kliknite na dugme da se prijavite. Link važi kratko i radi samo jednom.',
      cta: 'Prijavi se',
      ignore: 'Ako niste vi tražili prijavu, slobodno zanemarite ovu poruku.',
      fallback: 'Ako dugme ne radi, otvorite ovaj link:',
    },
    recovery: {
      subject: 'Promena lozinke za Sovu',
      heading: 'Promena lozinke',
      body: 'Kliknite na dugme da izaberete novu lozinku za nalog u Sovi. Link važi kratko i radi samo jednom.',
      cta: 'Izaberi novu lozinku',
      ignore: 'Ako niste vi tražili promenu, zanemarite poruku; lozinka ostaje ista.',
      fallback: 'Ako dugme ne radi, otvorite ovaj link:',
    },
  },
  en: {
    confirm: {
      subject: 'Confirm your email for Sova',
      heading: 'Confirm your email',
      body: 'Click the button to confirm your address and activate your Sova account.',
      cta: 'Confirm email',
      ignore: "If you didn't create an account, you can ignore this email.",
      fallback: "If the button doesn't work, open this link:",
    },
    login: {
      subject: 'Your Sova login link',
      heading: 'Log in to Sova',
      body: 'Click the button to log in. The link is valid for a short time and works only once.',
      cta: 'Log in',
      ignore: "If you didn't ask to log in, you can ignore this email.",
      fallback: "If the button doesn't work, open this link:",
    },
    recovery: {
      subject: 'Reset your Sova password',
      heading: 'Reset your password',
      body: 'Click the button to choose a new password for your Sova account. The link is valid for a short time and works only once.',
      cta: 'Choose a new password',
      ignore: "If you didn't ask for a reset, ignore this email; your password stays the same.",
      fallback: "If the button doesn't work, open this link:",
    },
  },
}

export function AuthLinkEmail({
  kind,
  url,
  name,
  locale = 'sr-Latn',
}: {
  kind: AuthLinkKind
  url: string
  name: string | null
  locale?: AppLocale
}) {
  const copy = AUTH_LINK_COPY[locale][kind]
  const first = name?.trim().split(/\s+/)[0]
  return (
    <EmailLayout preview={copy.heading} lang={EMAIL_COPY[locale].htmlLang}>
      <Heading as="h2" style={{ fontSize: 20, margin: '0 0 12px' }}>
        {copy.heading}
      </Heading>
      {first ? <Text style={emailText}>{EMAIL_COPY[locale].hello(first)}</Text> : null}
      <Text style={emailText}>{copy.body}</Text>
      <Button href={url} style={emailButton}>
        {copy.cta}
      </Button>
      <Text style={{ ...emailText, fontSize: 13, color: '#6b7280', marginTop: 20 }}>
        {copy.fallback} {url}
      </Text>
      <Text style={{ ...emailText, fontSize: 13, color: '#6b7280' }}>{copy.ignore}</Text>
    </EmailLayout>
  )
}
