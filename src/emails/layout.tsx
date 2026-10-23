import { Body, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components'
import type { ReactNode } from 'react'

import { company } from '@/config/company'

export function EmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="sr-Latn">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: '#f5f6f8',
          fontFamily: 'Inter, Arial, sans-serif',
          margin: 0,
          padding: '24px 0',
        }}
      >
        <Container style={{ backgroundColor: '#ffffff', borderRadius: 12, padding: 32, maxWidth: 560 }}>
          <Text style={{ fontSize: 20, fontWeight: 600, margin: '0 0 16px' }}>Sova</Text>
          <Section>{children}</Section>
          <Hr style={{ borderColor: '#e5e7eb', margin: '24px 0 12px' }} />
          <Text style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
            {company.legalName} · {company.appUrl}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const emailText = { fontSize: 15, lineHeight: '24px', color: '#111827', margin: '0 0 12px' } as const
export const emailButton = {
  backgroundColor: '#2563eb',
  color: '#ffffff',
  borderRadius: 8,
  padding: '12px 20px',
  fontSize: 15,
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-block',
} as const
