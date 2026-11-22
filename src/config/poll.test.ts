import { describe, expect, it } from 'vitest'

import {
  incompletePoll,
  normalizePoll,
  pollProblems,
  rawPoll,
  readPoll,
  LINKEDIN_POLL_DURATION,
} from './poll'

describe('anketa za LinkedIn (D-151, D-192)', () => {
  it('čita anketu tek sa pitanjem i dva odgovora; nedovršena je greška, ne običan tekst', () => {
    expect(readPoll({})).toBeNull()
    expect(
      readPoll({ poll: { question: 'Kafa ili čaj?', options: ['Kafa', ' '], durationDays: 3 } }),
    ).toBeNull()
    expect(incompletePoll({ poll: { question: '', options: ['A', 'B'] } })).toBe(true)
    expect(incompletePoll({})).toBe(false)
    expect(
      readPoll({
        poll: {
          question: ' Kafa ili čaj? ',
          options: ['Kafa', 'Čaj', 'Oba', 'Ništa', 'Voda'],
          durationDays: 9,
        },
      }),
    ).toEqual({
      question: 'Kafa ili čaj?',
      options: ['Kafa', 'Čaj', 'Oba', 'Ništa'],
      durationDays: 3,
    })
    // editor drži i prazna polja dok korisnik kuca
    expect(rawPoll({ poll: { question: '', options: [] } })).toEqual({
      question: '',
      options: ['', ''],
      durationDays: 3,
    })
  })

  it('granice LinkedIn-a: pitanje do 140 znakova, odgovor do 30', () => {
    const poll = {
      question: 'P'.repeat(150),
      options: ['Ovaj odgovor je duži od trideset znakova', 'B'],
      durationDays: 14 as const,
    }
    expect(pollProblems(poll, 'linkedin')).toEqual([
      'Pitanje ankete na LinkedIn-u može imati najviše 140 znakova.',
      'Odgovor u anketi na LinkedIn-u može imati najviše 30 znakova.',
    ])
    expect(pollProblems({ question: 'Q', options: ['Da', 'da'], durationDays: 1 }, 'linkedin')).toEqual([
      'Odgovori u anketi moraju biti različiti.',
    ])
    expect(LINKEDIN_POLL_DURATION[14]).toBe('FOURTEEN_DAYS')
  })

  it('odgovor modela: bez numeracije i ponavljanja, u granicama LinkedIn-a, trajanje 1, 3, 7 ili 14', () => {
    expect(
      normalizePoll({
        question: 'Koliko često servisirate klimu?',
        options: [
          '1. Svake godine',
          '2) Na dve godine',
          '- Kad se pokvari',
          'svake godine',
          'Nikad, a imam je deset godina',
        ],
        duration_days: 7,
      }),
    ).toEqual({
      question: 'Koliko često servisirate klimu?',
      options: ['Svake godine', 'Na dve godine', 'Kad se pokvari', 'Nikad, a imam je deset godina'],
      durationDays: 7,
    })
    expect(normalizePoll({ question: 'Samo jedan?', options: ['Da'] })).toBeNull()
    expect(normalizePoll(null)).toBeNull()
  })
})
