import { Heading, Text } from '@react-email/components'

import type { AppLocale } from '@/i18n/config'

import { EMAIL_COPY } from './copy'
import { EmailLayout, emailText } from './layout'

/**
 * Mesečni izveštaj za klijenta (D-094): PDF ide u prilogu, jer primalac nema nalog u Sovi.
 * Adrese upisuje vlasnik ili administrator brenda; poruka kaže kako da se prijem prekine. Jezik je
 * jezik brenda (D-130).
 */
export function MonthlyReportEmail({
  brandName,
  month,
  summary,
  locale = 'sr-Latn',
}: {
  brandName: string
  /** „oktobar 2026.” */
  month: string
  /** „18 objava, doseg 24.310, angažovanje 1.284” ili null za mesec bez objava */
  summary: string | null
  locale?: AppLocale
}) {
  const copy = EMAIL_COPY[locale]
  return (
    <EmailLayout preview={copy.reportPreview(brandName, month)} lang={copy.htmlLang}>
      <Heading as="h2" style={{ fontSize: 20, margin: '0 0 12px' }}>
        {copy.reportHeading(month)}
      </Heading>
      <Text style={emailText}>{copy.reportBody(brandName)}</Text>
      {summary ? <Text style={emailText}>{copy.reportSummary(summary)}</Text> : null}
      <Text style={{ fontSize: 13, lineHeight: '20px', color: '#6b7280', margin: '16px 0 0' }}>
        {copy.reportFooter}
      </Text>
    </EmailLayout>
  )
}
