import { Button, Text } from '@react-email/components'

import { EmailLayout, emailButton, emailText } from './layout'

const ROLE_LABEL: Record<string, string> = {
  admin: 'administrator',
  editor: 'urednik',
  approver: 'odobravalac',
  viewer: 'posmatrač',
}

export function InvitationEmail({
  inviterName,
  workspaceName,
  role,
  acceptUrl,
  expiresInDays,
}: {
  inviterName: string
  workspaceName: string
  role: string
  acceptUrl: string
  expiresInDays: number
}) {
  return (
    <EmailLayout preview={`${inviterName} vas poziva u radni prostor ${workspaceName}`}>
      <Text style={emailText}>
        {inviterName} vas poziva da se pridružite radnom prostoru <strong>{workspaceName}</strong> u Sovi kao{' '}
        {ROLE_LABEL[role] ?? role}.
      </Text>
      <Text style={emailText}>
        Kliknite na dugme da prihvatite pozivnicu. Link važi {expiresInDays} dana.
      </Text>
      <Button href={acceptUrl} style={emailButton}>
        Prihvati pozivnicu
      </Button>
      <Text style={{ ...emailText, fontSize: 13, color: '#6b7280', marginTop: 16 }}>
        Ako ne očekujete ovu pozivnicu, slobodno zanemarite poruku. Link: {acceptUrl}
      </Text>
    </EmailLayout>
  )
}
