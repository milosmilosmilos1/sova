import { describe, expect, it } from 'vitest'

import { routeLocale, type LocaleRequest } from './routing'

const page = (over: Partial<LocaleRequest> = {}): LocaleRequest => ({
  pathname: '/',
  search: '',
  cookie: undefined,
  method: 'GET',
  accept: 'text/html,application/xhtml+xml',
  acceptLanguage: null,
  userAgent: 'Mozilla/5.0',
  rsc: false,
  ...over,
})

describe('jezik javnog sajta u proxy-ju (D-130)', () => {
  it('/en i /uk se prepisuju na istu stranu i pamte jezik', () => {
    expect(routeLocale(page({ pathname: '/en/contact' }))).toEqual({
      kind: 'rewrite',
      path: '/kontakt',
      locale: 'en',
      cookie: 'en',
    })
    expect(routeLocale(page({ pathname: '/uk', cookie: 'uk' }))).toEqual({
      kind: 'rewrite',
      path: '/',
      locale: 'uk',
      cookie: null,
    })
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
    expect(routeLocale(page({ cookie: 'sr-Latn', acceptLanguage: 'en-US' }))).toEqual({
      kind: 'next',
      path: '/',
      locale: 'sr-Latn',
      cookie: null,
    })
  })

  it('prva poseta prati pregledač; bot i pregled linka ostaju na srpskom', () => {
    expect(routeLocale(page({ acceptLanguage: 'uk-UA,uk;q=0.9' }))).toEqual({
      kind: 'redirect',
      location: '/uk',
      cookie: 'uk',
    })
    expect(routeLocale(page({ acceptLanguage: 'sr-RS,sr;q=0.9' }))).toEqual({
      kind: 'next',
      path: '/',
      locale: 'sr-Latn',
      cookie: 'sr-Latn',
    })
    expect(routeLocale(page({ acceptLanguage: 'en-US', userAgent: 'facebookexternalhit/1.1' })).kind).toBe(
      'next',
    )
    expect(routeLocale(page({ acceptLanguage: 'en-US', userAgent: 'Googlebot/2.1' })).kind).toBe('next')
  })

  it('RSC i drugi zahtevi se ne preusmeravaju', () => {
    expect(routeLocale(page({ acceptLanguage: 'en-US', rsc: true })).kind).toBe('next')
    expect(routeLocale(page({ acceptLanguage: 'en-US', method: 'POST' })).kind).toBe('next')
  })
})
