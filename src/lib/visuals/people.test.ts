import { describe, expect, it } from 'vitest'

import { foreignPeopleText, localPeopleQuery, mentionsPeople, slugText } from './people'

describe('ljudi kao publika (D-136, D-154)', () => {
  it('upit koji pominje ljude ili scenu sa ljudima traži evropske ljude', () => {
    expect(localPeopleQuery('happy couple dinner')).toBe('european happy couple dinner')
    expect(localPeopleQuery('wedding hall decoration')).toBe('european wedding hall decoration')
    expect(localPeopleQuery('team meeting office')).toBe('european team meeting office')
    expect(localPeopleQuery('women smiling')).toBe('european women smiling')
    expect(localPeopleQuery('outdoor weddings summer')).toBe('european outdoor weddings summer')
    expect(localPeopleQuery('barber cutting hair')).toBe('european barber cutting hair')
    expect(localPeopleQuery('cleaners at work')).toBe('european cleaners at work')
    // „white” je u upitu skoro uvek boja, a ne izgled ljudi
    expect(localPeopleQuery('bride in white dress')).toBe('european bride in white dress')
  })

  it('upit bez ljudi i već određen upit ostaju kakvi jesu', () => {
    expect(localPeopleQuery('coffee shop interior')).toBe('coffee shop interior')
    expect(localPeopleQuery('caucasian family picnic')).toBe('caucasian family picnic')
    expect(localPeopleQuery('  ')).toBe('')
    // „human” u „humanitarian” i „man” u „manager” nisu ljudi: reč mora biti cela
    expect(localPeopleQuery('mango smoothie')).toBe('mango smoothie')
  })

  it('opis koji pominje drugi izgled ljudi odbija kandidata (D-154)', () => {
    for (const text of [
      'Black Woman Vacuuming the Living Room',
      'a black young woman smiling',
      'Asian man working on laptop',
      'african american family at home',
      'Afro-American couple dancing',
      'portrait of a woman of color',
      'diverse group of friends laughing',
      'Indian bride in red',
      'dark-skinned technician repairing air conditioner',
      'smiling man of asian descent',
      'mixed race couple',
      'woman with afro hairstyle',
    ])
      expect(foreignPeopleText(text), text).toBe(true)
  })

  it('boja odeće ili kose, jelo i predmet nisu izgled ljudi (D-154)', () => {
    for (const text of [
      'Woman in Black Tank Top Cleaning the Floor',
      'black haired woman holding a cup',
      'man in black suit',
      'black and white portrait of a man',
      'Black Friday shoppers',
      'indian food on a table',
      'japanese garden in autumn',
      'black air conditioner on white wall',
      'chinese lanterns at night',
      'a man holding a vacuum cleaner',
      null,
      '',
    ])
      expect(foreignPeopleText(text), String(text)).toBe(false)
  })

  it('ljudi u opisu i opis iz adrese stranice', () => {
    expect(mentionsPeople('a woman vacuuming the floor')).toBe(true)
    expect(mentionsPeople('cleaners posing with their work tools')).toBe(true)
    expect(mentionsPeople('a rusty air conditioner')).toBe(false)
    expect(mentionsPeople(null)).toBe(false)
    expect(slugText('https://www.pexels.com/video/a-woman-vacuuming-the-floor-9462892/')).toBe(
      'a woman vacuuming the floor',
    )
    expect(slugText('https://www.pexels.com/photo/man-installing-solar-panels-on-rooftop-8853486/')).toBe(
      'man installing solar panels on rooftop',
    )
    expect(slugText('https://www.pexels.com/video/101/')).toBe('')
    expect(slugText(null)).toBe('')
  })
})
