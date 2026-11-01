import { Button, Text } from '@react-email/components'

import type { AppLocale } from '@/i18n/config'

import { EMAIL_COPY } from './copy'
import { EmailLayout, emailButton, emailText } from './layout'

/** Pozivnica u radni prostor, na jeziku onoga ko poziva (D-130). */
export function InvitationEmail({
  inviterName,
  workspaceName,
  role,
  acceptUrl,
  expiresInDays,
  locale = 'sr-Latn',
}: {
  inviterName: string
  workspaceName: string
  role: string
  acceptUrl: string
  expiresInDays: number
  locale?: AppLocale
}) {
  const copy = EMAIL_COPY[locale]
  return (
    <EmailLayout preview={copy.invitePreview(inviterName, workspaceName)} lang={copy.htmlLang}>
      <Text style={emailText}>
        {copy.inviteLead(inviterName)}
        <strong>{workspaceName}</strong>
        {copy.inviteRole(copy.roles[role] ?? role)}
      </Text>
      <Text style={emailText}>{copy.inviteExpires(expiresInDays)}</Text>
      <Button href={acceptUrl} style={emailButton}>
        {copy.inviteAccept}
      </Button>
      <Text style={{ ...emailText, fontSize: 13, color: '#6b7280', marginTop: 16 }}>
        {copy.inviteIgnore(acceptUrl)}
      </Text>
    </EmailLayout>
  )
}
