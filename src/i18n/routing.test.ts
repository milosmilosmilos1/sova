import { describe, expect, it } from 'vitest'

import { routeLocale, type LocaleRequest } from './routing'

const page = (over: Partial<LocaleRequest> = {}): LocaleRequest => ({
  pathname: '/',
  search: '',
  cookie: undefined,
  method: 'GET',
  accept: 'text/html,application/xhtml+xml',
  rsc: false,
  ...over,
})

describe('jezik javnog sajta u proxy-ju (D-130)', () => {
  it('/en se prepisuje na istu stranu i pamti jezik; stare /uk adrese trajno vode na /en (D-173)', () => {
    expect(routeLocale(page({ pathname: '/en/contact' }))).toEqual({
      kind: 'rewrite',
      path: '/kontakt',
      locale: 'en',
      cookie: 'en',
    })
    expect(routeLocale(page({ pathname: '/en', cookie: 'en' }))).toEqual({
      kind: 'rewrite',
      path: '/',
      locale: 'en',
      cookie: null,
    })
    expect(routeLocale(page({ pathname: '/uk', cookie: 'uk' }))).toEqual({
      kind: 'redirect',
      location: '/en',
      cookie: 'en',
      permanent: true,
    })
    expect(routeLocale(page({ pathname: '/uk/contact', search: '?a=1' }))).toEqual({
      kind: 'redirect',
      location: '/en/contact?a=1',
      cookie: 'en',
      permanent: true,
    })
    // reč koja počinje sa „uk” nije stara adresa
    expect(routeLocale(page({ pathname: '/ukrasi' })).kind).toBe('next')
  })

  it('aplikacija nema prefiks: /en/app vodi na /app, a jezik se pamti', () => {
    expect(routeLocale(page({ pathname: '/en/app/plan', search: '?x=1' }))).toEqual({
      kind: 'redirect',
      location: '/app/plan?x=1',
      cookie: 'en',
    })
    expect(routeLocale(page({ pathname: '/app', cookie: 'en' }))).toEqual({
      kind: 'next',
      path: '/app',
      locale: null,
      cookie: null,
    })
  })

  it('izbor jezika (?lang=) menja kolačić i adresu, ostatak upita ostaje', () => {
    expect(routeLocale(page({ pathname: '/kontakt', search: '?lang=en&ref=x', cookie: 'sr-Latn' }))).toEqual({
      kind: 'redirect',
      location: '/en/contact?ref=x',
      cookie: 'en',
    })
    expect(routeLocale(page({ pathname: '/', search: '?lang=sr-Latn', cookie: 'en' }))).toEqual({
      kind: 'redirect',
      location: '/',
      cookie: 'sr-Latn',
    })
  })

  it('posetilac koji je izabrao engleski ide na engleski, srpski ostaje na srpskom', () => {
    expect(routeLocale(page({ pathname: '/register', cookie: 'en' }))).toEqual({
      kind: 'redirect',
      location: '/en/register',
      cookie: null,
    })
    expect(routeLocale(page({ cookie: 'sr-Latn' }))).toEqual({
      kind: 'next',
      path: '/',
      locale: 'sr-Latn',
      cookie: null,
    })
  })

  it('bez izbora je srpski, i kad pregledač traži engleski (D-187)', () => {
    expect(routeLocale(page())).toEqual({ kind: 'next', path: '/', locale: 'sr-Latn', cookie: null })
    expect(routeLocale(page({ pathname: '/login', search: '?error=link' }))).toEqual({
      kind: 'next',
      path: '/login',
      locale: 'sr-Latn',
      cookie: null,
    })
    expect(routeLocale(page({ pathname: '/register', cookie: 'nepoznat' })).kind).toBe('next')
  })

  it('RSC i drugi zahtevi se ne preusmeravaju', () => {
    expect(routeLocale(page({ cookie: 'en', rsc: true })).kind).toBe('next')
    expect(routeLocale(page({ cookie: 'en', method: 'POST' })).kind).toBe('next')
  })
})
