import { Button, Heading, Text } from '@react-email/components'

import type { AppLocale } from '@/i18n/config'

import { EMAIL_COPY } from './copy'
import { EmailLayout } from './layout'

/** Opšte obaveštenje (odobrenje, odluka, greška objave) sa jednim dugmetom, na jeziku primaoca. */
export function NoticeEmail({
  title,
  body,
  ctaUrl,
  ctaLabel,
  recipientName,
  locale = 'sr-Latn',
}: {
  title: string
  body: string
  ctaUrl: string | null
  ctaLabel: string | null
  recipientName: string | null
  locale?: AppLocale
}) {
  const copy = EMAIL_COPY[locale]
  return (
    <EmailLayout preview={title} lang={copy.htmlLang}>
      <Heading as="h2" style={{ fontSize: 20, margin: '0 0 12px' }}>
        {title}
      </Heading>
      {recipientName ? (
        <Text style={{ margin: '0 0 8px' }}>{copy.hello(recipientName.split(' ')[0]!)}</Text>
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
