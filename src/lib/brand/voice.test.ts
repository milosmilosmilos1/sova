import { describe, expect, it } from 'vitest'

import { brandPromptLines, type BrandContext } from '@/lib/ai/prompts/post-text'
import { buildVoiceDraftPrompt, normalizeVoiceDraft } from '@/lib/ai/prompts/voice'
import { completeSetupSchema, setupFlowDays } from '@/lib/schemas/setup'
import { brandVoiceSchema, EMPTY_VOICE, mergeVoice } from '@/lib/schemas/voice'

import { emptyField, emptyProfile } from './profile-schema'
import { parseVoice, voiceFromProfile } from './voice'

/** Glas brenda i uvod u sedam koraka (D-112). */
describe('glas brenda', () => {
  it('šema skraćuje razmake i izbacuje iste teme bez obzira na velika slova', () => {
    const v = brandVoiceSchema.parse({
      offer: '  Servis klima  ',
      topics: ['Saveti pred leto', 'saveti pred leto', ' Iza scene '],
    })
    expect(v.offer).toBe('Servis klima')
    expect(v.topics).toEqual(['Saveti pred leto', 'Iza scene'])
    expect(v.cta).toBe('')
    expect(
      brandVoiceSchema.safeParse({ topics: Array.from({ length: 9 }, (_, i) => `Tema ${i}`) }).success,
    ).toBe(false)
    expect(brandVoiceSchema.safeParse({ tone: 'x'.repeat(201) }).success).toBe(false)
  })

  it('prazan ili neispravan sačuvan glas je null', () => {
    expect(parseVoice({})).toBeNull()
    expect(parseVoice(null)).toBeNull()
    expect(parseVoice({ offer: '', topics: [] })).toBeNull()
    expect(parseVoice({ offer: 7 })).toBeNull()
    expect(parseVoice({ tone: 'opušteno', updated_at: '2026-10-30' })?.tone).toBe('opušteno')
  })

  it('predlog popunjava samo prazna polja i dodaje nove teme do osam', () => {
    const current = { ...EMPTY_VOICE, offer: 'Moja ponuda', topics: ['A tema', 'B tema'] }
    const draft = {
      ...EMPTY_VOICE,
      offer: 'Predlog ponude',
      tone: 'stručno',
      topics: ['b tema', 'C tema', 'D tema', 'E tema', 'F tema', 'G tema', 'H tema', 'I tema'],
    }
    const merged = mergeVoice(current, draft)
    expect(merged.offer).toBe('Moja ponuda')
    expect(merged.tone).toBe('stručno')
    expect(merged.topics).toHaveLength(8)
    expect(merged.topics.slice(0, 3)).toEqual(['A tema', 'B tema', 'C tema'])
  })

  it('predlog iz profila uzima opis, publiku, ton, prednosti i stubove sadržaja', () => {
    const p = emptyProfile({ name: 'Klima Plus', contentLocale: 'sr-Latn', websiteUrl: null })
    p.identity.description = emptyField('Ugradnja i servis klima uređaja u Beogradu.', 0.9)
    p.audience.segments = emptyField([{ name: 'Vlasnici stanova', description: 'žele tiho i čisto' }], 0.8)
    p.voice.tone = emptyField(['opušteno', 'stručno'], 0.7)
    p.offer.differentiators = emptyField(['ugradnja za jedan dan', 'garancija dve godine'], 0.8)
    p.content.content_pillars = emptyField(
      [
        { name: 'Održavanje pred leto', description: 'saveti' },
        { name: 'Iza scene', description: 'ekipa na terenu' },
      ],
      0.6,
    )
    p.content.blog_topics = emptyField(['iza scene', 'Ušteda struje'], 0.5)
    const v = voiceFromProfile(p)
    expect(v.offer).toContain('Ugradnja i servis')
    expect(v.audience).toBe('Vlasnici stanova (žele tiho i čisto)')
    expect(v.tone).toBe('opušteno, stručno')
    expect(v.usp).toBe('ugradnja za jedan dan; garancija dve godine')
    expect(v.topics).toEqual(['Održavanje pred leto', 'Iza scene', 'Ušteda struje'])
    // bez opisa ponuda dolazi iz usluga
    p.identity.description = emptyField(null)
    p.offer.services = emptyField(
      [
        { name: 'Ugradnja', description: null },
        { name: 'Servis', description: null },
      ],
      0.7,
    )
    expect(voiceFromProfile(p).offer).toBe('Ugradnja, Servis')
  })

  it('prompt ima glas vlasnika ispred odlomaka i ne dodaje podrazumevan ton', () => {
    const brand: BrandContext = {
      name: 'Klima Plus',
      locale: 'sr-Latn',
      knowledge: ['Odlomak sa sajta.'],
      voice: { offer: 'Servis klima', tone: 'opušteno', avoid: 'bez cena', cta: 'Pozovite nas' },
    }
    const text = brandPromptLines(brand).join('\n')
    expect(text).toContain('GLAS BRENDA (reči vlasnika; imaju prednost')
    expect(text).toContain('Kako zvuči: opušteno')
    expect(text).toContain('Šta nikad ne piše: bez cena')
    expect(text).not.toContain('prijateljski i jasan')
    expect(text.indexOf('GLAS BRENDA')).toBeLessThan(text.indexOf('ODLOMCI SA SAJTA'))
    // bez glasa ostaje stari opis brenda
    const plain = brandPromptLines({ name: 'Klima Plus', locale: 'sr-Latn' }).join('\n')
    expect(plain).not.toContain('GLAS BRENDA')
    expect(plain).toContain('prijateljski i jasan')
  })

  it('odgovor modela se skraćuje, a teme čiste od nabrajanja, heštegova i duplikata', () => {
    const out = normalizeVoiceDraft({
      offer: 'a'.repeat(700),
      audience: 'Vlasnici   stanova',
      tone: 'opušteno',
      usp: '',
      avoid: 'bez cena',
      cta: 'Pozovite',
      topics: [
        '1. Saveti pred leto #klima',
        '- saveti pred leto',
        '• Iza scene',
        'ok',
        ...Array(10).fill('Tema X'),
      ],
    })
    expect(out.offer).toHaveLength(600)
    expect(out.offer.endsWith('…')).toBe(true)
    expect(out.audience).toBe('Vlasnici stanova')
    expect(out.topics).toEqual(['Saveti pred leto', 'Iza scene', 'Tema X'])
  })

  it('prompt za predlog piše na jeziku brenda i podatke drži između oznaka', () => {
    const prompt = buildVoiceDraftPrompt({
      brandName: 'Klima Plus',
      locale: 'uk',
      profile: ['Opis: servis klima'],
      documents: ['Cenovnik ugradnje'],
      posts: [],
    })
    expect(prompt.startsWith('Пиши українською мовою.')).toBe(true)
    expect(prompt).toContain('ODLOMCI IZ DOKUMENTA O BRENDU')
    expect(prompt).not.toContain('RANIJE OBJAVE BRENDA')
    expect(prompt.match(/<<<PODACI>>>/g)).toHaveLength(2)
  })
})

describe('uvod u sedam koraka', () => {
  it('tokovi iz tema dobijaju po dva dana, pomereno', () => {
    expect(setupFlowDays(0)).toEqual([1, 4])
    expect(setupFlowDays(1)).toEqual([2, 5])
    expect(setupFlowDays(2)).toEqual([3, 6])
    expect(setupFlowDays(3)).toEqual([1, 4])
  })

  it('kraj uvoda prima najviše osam tema', () => {
    expect(completeSetupSchema.parse({}).flows).toEqual([])
    const nine = Array.from({ length: 9 }, (_, i) => ({ topic: `Tema ${i}`, active: true }))
    expect(completeSetupSchema.safeParse({ flows: nine }).success).toBe(false)
    expect(completeSetupSchema.safeParse({ flows: [{ topic: 'ab', active: true }] }).success).toBe(false)
  })
})
