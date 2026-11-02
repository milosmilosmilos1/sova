import { describe, expect, it } from 'vitest'

import { localPeopleQuery, peopleLookFor } from './people'

describe('ljudi kao publika (D-136)', () => {
  it('upit koji pominje ljude ili scenu sa ljudima traži evropske ljude', () => {
    expect(localPeopleQuery('happy couple dinner', 'europe')).toBe('european happy couple dinner')
    expect(localPeopleQuery('wedding hall decoration', 'europe')).toBe('european wedding hall decoration')
    expect(localPeopleQuery('team meeting office', 'europe')).toBe('european team meeting office')
    expect(localPeopleQuery('women smiling', 'europe')).toBe('european women smiling')
    expect(localPeopleQuery('outdoor weddings summer', 'europe')).toBe('european outdoor weddings summer')
    expect(localPeopleQuery('barber cutting hair', 'europe')).toBe('european barber cutting hair')
    // „white” je u upitu skoro uvek boja, a ne izgled ljudi
    expect(localPeopleQuery('bride in white dress', 'europe')).toBe('european bride in white dress')
  })

  it('upit bez ljudi, već određen upit i brend bez lokalnog izgleda ostaju kakvi jesu', () => {
    expect(localPeopleQuery('coffee shop interior', 'europe')).toBe('coffee shop interior')
    expect(localPeopleQuery('caucasian family picnic', 'europe')).toBe('caucasian family picnic')
    expect(localPeopleQuery('happy couple dinner', 'any')).toBe('happy couple dinner')
    expect(localPeopleQuery('  ', 'europe')).toBe('')
    // „human” u „humanitarian” i „man” u „manager” nisu ljudi: reč mora biti cela
    expect(localPeopleQuery('mango smoothie', 'europe')).toBe('mango smoothie')
  })

  it('lokalni izgled važi za srpski i ukrajinski, a brend ga može isključiti', () => {
    expect(peopleLookFor('sr-Latn')).toBe('europe')
    expect(peopleLookFor('sr-Cyrl', 'local')).toBe('europe')
    expect(peopleLookFor('uk')).toBe('europe')
    expect(peopleLookFor('en')).toBe('any')
    expect(peopleLookFor('sr-Latn', 'any')).toBe('any')
    expect(peopleLookFor(null)).toBe('any')
  })
})
