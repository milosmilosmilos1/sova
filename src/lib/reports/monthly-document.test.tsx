import { writeFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { renderMonthlyReport, type MonthlyReportData } from './monthly-document'

const daily = Array.from({ length: 31 }, (_, i) => {
  const d = String(i + 1).padStart(2, '0')
  const v = i % 3 === 0 ? 0 : Math.round(400 + 900 * Math.abs(Math.sin(i / 3)) + (i === 17 ? 2600 : 0))
  return { date: `2026-10-${d}`, label: `${i + 1}. okt`, value: v }
})
const SAMPLE: MonthlyReportData = {
  brandName: 'Klima servis (demo)',
  month: 'oktobar 2026.',
  previousMonth: 'septembar',
  generatedAt: '1. 11. 2026.',
  kpis: [
    { label: 'Objave', value: '18', delta: 12.5 },
    { label: 'Doseg', value: '24.310', delta: -8 },
    { label: 'Prikazi', value: '41.902', delta: null },
    { label: 'Angažovanje', value: '1.284', delta: 31.2 },
    { label: 'Stopa angažovanja', value: '5,3 %', delta: 0 },
  ],
  daily,
  platforms: [
    { label: 'Instagram', posts: 10, reach: 16000, engagement: 900, engagementRate: 0.0562 },
    { label: 'Facebook', posts: 8, reach: 8310, engagement: 384, engagementRate: 0.0462 },
  ],
  pillars: [
    { label: 'Edukacija', posts: 9, reach: 12000, engagement: 700, engagementRate: 0.0583 },
    { label: 'Ponude', posts: 5, reach: 7000, engagement: 300, engagementRate: 0.0428 },
  ],
  topPosts: [
    {
      date: '18. 10.',
      platform: 'Instagram',
      excerpt:
        'Tri znaka da klimi treba servis: slabije hladi ili greje, čuje se novi zvuk i oseća se miris pri uključivanju.',
      reach: 4200,
      engagement: 310,
      engagementRate: 0.0738,
    },
    {
      date: '7. 10.',
      platform: 'Facebook',
      excerpt: 'Čišćenje filtera pre grejne sezone štedi struju i čuva zdravlje ukućana.',
      reach: 2100,
      engagement: 96,
      engagementRate: 0.0457,
    },
  ],
  followers: [
    { account: 'klimaservis.demo · Instagram', first: 1840, last: 1912, delta: 72 },
    { account: 'Klima servis (demo) · Facebook', first: 960, last: 951, delta: -9 },
  ],
  insights: [
    {
      claim: 'Objave sa savetima imaju 40 % veći doseg od ponuda.',
      recommendation: 'Nastavite sa dva saveta nedeljno i uz svaki dodajte kratak poziv na servis.',
    },
    {
      claim: 'Najbolje prolaze objave utorkom i četvrtkom posle 18 h.',
      recommendation: 'Zakažite ključne objave u tim terminima.',
    },
  ],
  notes: [
    '2 objave još nema metrike: prvi snimak stiže sat vremena posle objave, zatim posle 24 h, 7 i 30 dana.',
  ],
  empty: false,
}

describe('mesečni PDF izveštaj (D-094)', () => {
  it('pravi PDF sa srpskim slovima, grafikonom i tabelama', async () => {
    const buf = await renderMonthlyReport(SAMPLE)
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(10_000)
    // za pregled: REPORT_PDF_OUT=putanja npx vitest run src/lib/reports
    if (process.env.REPORT_PDF_OUT) writeFileSync(process.env.REPORT_PDF_OUT, buf)
  })

  it('prazan mesec bez objava ne pada', async () => {
    const buf = await renderMonthlyReport({
      ...SAMPLE,
      daily: SAMPLE.daily.map((d) => ({ ...d, value: 0 })),
      platforms: [],
      pillars: [],
      topPosts: [],
      insights: [],
      notes: [],
      empty: true,
    })
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
