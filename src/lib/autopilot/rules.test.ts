import { describe, expect, it } from 'vitest'

import {
  budgetState,
  canSpend,
  deadlineAction,
  extractClaims,
  firstMondayNextMonth,
  holidaysInWindow,
  isMonthlyRunDue,
  isOutlier,
  isWeeklyRunDue,
  nextWeekRange,
  qaCheck,
  similarity,
} from '@/lib/autopilot/rules'

const TZ = 'Europe/Belgrade'

describe('budžet', () => {
  it('bez limita, ispod 80 %, upozorenje, zaustavljanje', () => {
    expect(budgetState(500, null).state).toBe('unlimited')
    expect(budgetState(10, 100)).toMatchObject({ state: 'ok', percent: 10, remaining: 90 })
    expect(budgetState(80, 100).state).toBe('warning')
    expect(budgetState(100, 100).state).toBe('stopped')
    expect(budgetState(0, 0).state).toBe('stopped')
    expect(canSpend(98, 100, 2)).toBe(true)
    expect(canSpend(99, 100, 2)).toBe(false)
    expect(canSpend(9999, null, 2)).toBe(true)
  })
})

describe('vreme prolaza', () => {
  it('sledeća nedelja i nedeljni prolaz ponedeljkom od 06 po Beogradu', () => {
    // ponedeljak 26.10.2026 06:30 po Beogradu = 05:30 UTC (CET posle 25.10.)
    const mon = new Date('2026-10-26T05:30:00Z')
    expect(isWeeklyRunDue(mon, TZ)).toBe(true)
    expect(isWeeklyRunDue(new Date('2026-10-26T04:30:00Z'), TZ)).toBe(false)
    expect(isWeeklyRunDue(new Date('2026-10-27T05:30:00Z'), TZ)).toBe(false)
    expect(nextWeekRange(mon, TZ)).toEqual({ start: '2026-11-02', end: '2026-11-08' })
    expect(nextWeekRange(new Date('2026-10-24T10:00:00Z'), TZ)).toEqual({
      start: '2026-10-26',
      end: '2026-11-01',
    })
  })
  it('mesečni prolaz od 25. i prvi ponedeljak sledećeg meseca', () => {
    expect(isMonthlyRunDue(new Date('2026-10-25T10:00:00Z'), TZ)).toBe(true)
    expect(isMonthlyRunDue(new Date('2026-10-24T10:00:00Z'), TZ)).toBe(false)
    expect(firstMondayNextMonth(new Date('2026-10-25T10:00:00Z'), TZ)).toBe('2026-11-02')
    expect(firstMondayNextMonth(new Date('2026-12-25T10:00:00Z'), TZ)).toBe('2027-01-04')
  })
})

describe('rok za odobrenje', () => {
  const base = { scheduledFor: '2026-11-03T17:00:00Z', deadlineHours: 24, unapprovedAction: 'skip' as const }
  it('pre roka čeka; nivo 2 preskače ili objavljuje; nivo 1 podseća pa vraća', () => {
    expect(deadlineAction({ ...base, level: 2, now: new Date('2026-11-02T10:00:00Z') })).toBe('wait')
    expect(deadlineAction({ ...base, level: 2, now: new Date('2026-11-02T18:00:00Z') })).toBe('skip')
    expect(
      deadlineAction({
        ...base,
        level: 2,
        unapprovedAction: 'publish',
        now: new Date('2026-11-02T18:00:00Z'),
      }),
    ).toBe('publish')
    expect(
      deadlineAction({
        ...base,
        level: 2,
        unapprovedAction: 'publish',
        now: new Date('2026-11-03T17:00:30Z'),
      }),
    ).toBe('skip')
    expect(deadlineAction({ ...base, level: 1, now: new Date('2026-11-02T18:00:00Z') })).toBe('remind')
    expect(deadlineAction({ ...base, level: 1, now: new Date('2026-11-03T17:01:00Z') })).toBe('expire')
  })
})

describe('kontrola kvaliteta', () => {
  const ok = {
    platform: 'facebook' as const,
    text: 'Servis klima uređaja u Beogradu: dolazimo na adresu i čistimo unutrašnju jedinicu. Zakažite termin porukom.',
    hashtags: ['#klima'],
    locale: 'sr-Latn' as const,
    forbiddenWords: ['najjeftiniji'],
    factsCorpus: 'Garancija 2 godine. Servis od 3500 dinara.',
    recentTexts: ['Danas smo bili na terenu u Zemunu i montirali dve nove klime.'],
    hasMedia: false,
  }
  it('dobar tekst prolazi sve provere', () => {
    const r = qaCheck(ok)
    expect(r.passed).toBe(true)
    expect(r.checks.map((c) => c.name)).toEqual([
      'empty',
      'length',
      'forbidden',
      'script',
      'similarity',
      'facts',
      'media',
    ])
  })
  it('zabranjena reč, ćirilica, izmišljena cena, sličnost i vizual padaju', () => {
    expect(
      qaCheck({ ...ok, text: `${ok.text} Najjeftiniji smo u gradu.` }).checks.find(
        (c) => c.name === 'forbidden',
      )?.ok,
    ).toBe(false)
    expect(
      qaCheck({
        ...ok,
        text: 'Сервис клима уређаја у Београду, долазимо на адресу и чистимо јединицу.',
      }).checks.find((c) => c.name === 'script')?.ok,
    ).toBe(false)
    // ukrajinski se piše ćirilicom: latinica pada, ćirilica prolazi (D-108)
    const uk = 'Сервіс кондиціонерів у Києві: приїдемо за адресою і почистимо внутрішній блок.'
    expect(qaCheck({ ...ok, locale: 'uk', text: uk }).checks.find((c) => c.name === 'script')?.ok).toBe(true)
    expect(qaCheck({ ...ok, locale: 'uk' }).checks.find((c) => c.name === 'script')?.ok).toBe(false)
    const price = qaCheck({ ...ok, text: `${ok.text} Akcija: 20% popusta, servis 2900 dinara.` })
    expect(price.checks.find((c) => c.name === 'facts')).toMatchObject({ ok: false })
    expect(price.checks.find((c) => c.name === 'facts')?.message).toContain('20')
    expect(
      qaCheck({ ...ok, text: `${ok.text} Servis od 3500 dinara uz garanciju 2 godine.` }).checks.find(
        (c) => c.name === 'facts',
      )?.ok,
    ).toBe(true)
    expect(qaCheck({ ...ok, recentTexts: [ok.text] }).checks.find((c) => c.name === 'similarity')?.ok).toBe(
      false,
    )
    expect(qaCheck({ ...ok, platform: 'instagram' }).checks.find((c) => c.name === 'media')?.ok).toBe(false)
  })
  it('sličnost, brojke bez jedinice ispod 10 i vreme se ne broje kao tvrdnje', () => {
    expect(similarity('servis klima uređaja danas u gradu', 'servis klima uređaja danas u gradu')).toBe(1)
    expect(similarity('jedan dva tri četiri', 'pet šest sedam osam')).toBe(0)
    expect(extractClaims('Radimo od 08:00 do 18:00, 3 servisera, 25% popusta, 1.500 dinara')).toEqual([
      '25',
      '1.500',
    ])
  })
})

describe('okidači', () => {
  it('objava sa dvostrukim angažovanjem od proseka (bar 5 objava u osnovi)', () => {
    expect(isOutlier(40, [10, 10, 10, 10, 10])).toBe(true)
    expect(isOutlier(15, [10, 10, 10, 10, 10])).toBe(false)
    expect(isOutlier(40, [10, 10])).toBe(false)
  })
  it('praznici u narednih 7 dana', () => {
    const list = [{ date: '2026-10-24' }, { date: '2026-10-28' }, { date: '2026-11-05' }]
    expect(holidaysInWindow(list, '2026-10-24')).toEqual([{ date: '2026-10-28' }])
  })
})
