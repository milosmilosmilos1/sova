import { describe, expect, it } from 'vitest'

import { accountAvatarUrl } from './avatar'

describe('slika naloga za prikaz', () => {
  it('Facebook stranica dobija stalnu adresu Graph-a umesto potpisane adrese koja ističe', () => {
    expect(
      accountAvatarUrl({
        platform: 'facebook',
        externalId: '123456789012345',
        avatarUrl: 'https://scontent.xx.fbcdn.net/v/t39.30808-1/p50x50/1.jpg?oe=6A000000',
      }),
    ).toBe('https://graph.facebook.com/123456789012345/picture?type=normal')
  })

  it('ostale mreže i neobičan ID zadržavaju sačuvanu adresu', () => {
    const ig = 'https://scontent.cdninstagram.com/v/t51/1.jpg'
    expect(accountAvatarUrl({ platform: 'instagram', externalId: '1789', avatarUrl: ig })).toBe(ig)
    expect(accountAvatarUrl({ platform: 'facebook', externalId: '../x', avatarUrl: ig })).toBe(ig)
    expect(accountAvatarUrl({ platform: 'linkedin', externalId: 'abc', avatarUrl: null })).toBeNull()
  })
})
