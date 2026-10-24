import { Button, Heading, Text } from '@react-email/components'

import { EmailLayout } from './layout'

/** Opšte obaveštenje (odobrenje, odluka, greška objave) sa jednim dugmetom. */
export function NoticeEmail({
  title,
  body,
  ctaUrl,
  ctaLabel,
  recipientName,
}: {
  title: string
  body: string
  ctaUrl: string | null
  ctaLabel: string | null
  recipientName: string | null
}) {
  return (
    <EmailLayout preview={title}>
      <Heading as="h2" style={{ fontSize: 20, margin: '0 0 12px' }}>
        {title}
      </Heading>
      {recipientName ? (
        <Text style={{ margin: '0 0 8px' }}>Zdravo, {recipientName.split(' ')[0]}.</Text>
      ) : null}
      <Text style={{ margin: '0 0 16px', whiteSpace: 'pre-wrap' }}>{body}</Text>
      {ctaUrl && ctaLabel ? (
        <Button
          href={ctaUrl}
          style={{
            backgroundColor: '#111827',
            color: '#ffffff',
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          {ctaLabel}
        </Button>
      ) : null}
    </EmailLayout>
  )
}
