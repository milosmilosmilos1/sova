import { describe, expect, it } from 'vitest'

import { insightsJsonSchema, insightsOutputSchema } from '@/lib/ai/prompts/insights'
import { brandPromptLines } from '@/lib/ai/prompts/post-text'

import {
  mergePlaybook,
  parsePlaybook,
  PLAYBOOK_AVOID_MAX,
  PLAYBOOK_WORKS_MAX,
  storedPlaybook,
} from './playbook'

/** Playbook brenda iz rezultata objava (D-113). */
describe('playbook', () => {
  const meta = {
    insightId: 'ins-1',
    posts: 4,
    from: '2026-10-01',
    to: '2026-10-30',
    now: new Date('2026-10-30T10:00:00Z'),
  }

  it('prazan ili neispravan sačuvan playbook je null, a sačuvan se čita nazad', () => {
    expect(parsePlaybook({})).toBeNull()
    expect(parsePlaybook(null)).toBeNull()
    expect(parsePlaybook({ works: 'x' })).toBeNull()
    const p = mergePlaybook(
      null,
      { summary: 'Saveti rade.', works: ['Karusel sa savetima'], avoid: [] },
      meta,
    )
    expect(parsePlaybook(storedPlaybook(p))).toEqual(p)
    expect(p.updatedAt).toBe('2026-10-30T10:00:00.000Z')
    expect(p.basedOn).toEqual({ posts: 4, from: '2026-10-01', to: '2026-10-30' })
  })

  it('nova pravila idu na vrh, bez nabrajanja i duplikata, u granicama', () => {
    const prev = mergePlaybook(
      null,
      { summary: 'Staro.', works: ['A pravilo', 'B pravilo'], avoid: ['C pravilo'] },
      meta,
    )
    const next = mergePlaybook(
      prev,
      {
        summary: '',
        works: ['- b pravilo', '2. D pravilo', ...Array.from({ length: 8 }, (_, i) => `Novo ${i}`)],
        avoid: ['• E pravilo'],
      },
      meta,
    )
    expect(next.summary).toBe('Staro.')
    expect(next.works.slice(0, 2)).toEqual(['b pravilo', 'D pravilo'])
    expect(next.works).toHaveLength(PLAYBOOK_WORKS_MAX)
    expect(next.avoid).toEqual(['E pravilo', 'C pravilo'])
    expect(next.avoid.length).toBeLessThanOrEqual(PLAYBOOK_AVOID_MAX)
  })

  it('pravilo koje nova analiza prebaci na suprotnu stranu nestaje sa stare', () => {
    const prev = mergePlaybook(
      null,
      { summary: 'x', works: ['Iza scene'], avoid: ['Popust na početku'] },
      meta,
    )
    const next = mergePlaybook(
      prev,
      { summary: 'y', works: ['Popust na početku'], avoid: ['iza scene'] },
      meta,
    )
    expect(next.works).toEqual(['Popust na početku'])
    expect(next.avoid).toEqual(['iza scene'])
  })

  it('model mora da vrati playbook, a stari odgovor bez njega i dalje prolazi', () => {
    const schema = insightsJsonSchema() as { required?: string[] }
    expect(schema.required).toContain('playbook')
    expect(insightsOutputSchema.safeParse({ items: [] }).success).toBe(true)
  })

  it('prompt ima playbook posle glasa brenda, a bez njega bloka nema', () => {
    const text = brandPromptLines({
      name: 'Klima Plus',
      locale: 'sr-Latn',
      voice: { offer: 'Servis klima' },
      playbook: { summary: 'Saveti rade.', works: ['Karusel sa savetima'], avoid: ['Popust na početku'] },
      knowledge: ['Odlomak.'],
    }).join('\n')
    expect(text).toContain('PLAYBOOK (naučeno iz rezultata ranijih objava')
    expect(text).toContain('Zaključak: Saveti rade.')
    expect(text).toContain('Ponavljaj: Karusel sa savetima')
    expect(text).toContain('Izbegavaj: Popust na početku')
    expect(text.indexOf('GLAS BRENDA')).toBeLessThan(text.indexOf('PLAYBOOK'))
    expect(text.indexOf('PLAYBOOK')).toBeLessThan(text.indexOf('ODLOMCI SA SAJTA'))
    expect(brandPromptLines({ name: 'X', locale: 'en', playbook: null }).join('\n')).not.toContain('PLAYBOOK')
  })
})
