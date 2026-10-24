import { Heading, Text } from '@react-email/components'

import { EmailLayout, emailText } from './layout'

/**
 * Mesečni izveštaj za klijenta (D-094): PDF ide u prilogu, jer primalac nema nalog u Sovi.
 * Adrese upisuje vlasnik ili administrator brenda; poruka kaže kako da se prijem prekine.
 */
export function MonthlyReportEmail({
  brandName,
  month,
  summary,
}: {
  brandName: string
  /** „oktobar 2026.” */
  month: string
  /** „18 objava, doseg 24.310, angažovanje 1.284” ili null za mesec bez objava */
  summary: string | null
}) {
  return (
    <EmailLayout preview={`${brandName}: izveštaj o društvenim mrežama za ${month}`}>
      <Heading as="h2" style={{ fontSize: 20, margin: '0 0 12px' }}>
        Izveštaj za {month}
      </Heading>
      <Text style={emailText}>
        U prilogu je PDF izveštaj o društvenim mrežama za {brandName}: objave, doseg, angažovanje, najbolje
        objave i preporuke za sledeći mesec.
      </Text>
      {summary ? <Text style={emailText}>Ukratko: {summary}.</Text> : null}
      <Text style={{ fontSize: 13, lineHeight: '20px', color: '#6b7280', margin: '16px 0 0' }}>
        Ovu poruku dobijate jer je vaša adresa upisana kao primalac mesečnog izveštaja. Ako više ne želite da
        ga dobijate, javite se osobi koja vodi vaše društvene mreže.
      </Text>
    </EmailLayout>
  )
}
