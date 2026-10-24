import { describe, expect, it } from 'vitest'

import { ProviderError } from '@/integrations/social/errors'
import { ApiError } from '@/lib/api/errors'
import {
  classifyPublishError,
  nextFullMinute,
  retryDelayMs,
  rollupPostStatus,
  sameMinute,
} from '@/lib/posts/publish-rules'

describe('rollupPostStatus (K12)', () => {
  it('svi targeti uspeli → published; ručno objavljeni se računaju kao uspeh', () => {
    expect(rollupPostStatus(['published'])).toBe('published')
    expect(rollupPostStatus(['published', 'assisted_done'])).toBe('published')
  })
  it('nijedan uspeo → failed; mešano → partially_published', () => {
    expect(rollupPostStatus(['failed', 'canceled'])).toBe('failed')
    expect(rollupPostStatus(['published', 'failed'])).toBe('partially_published')
  })
  it('dok neki još čeka: publishing ako nešto ide ili je prošlo, inače scheduled', () => {
    expect(rollupPostStatus(['publishing', 'scheduled'])).toBe('publishing')
    expect(rollupPostStatus(['published', 'scheduled'])).toBe('publishing')
    expect(rollupPostStatus(['scheduled', 'assisted_pending'])).toBe('scheduled')
    expect(rollupPostStatus(['failed', 'needs_reauth'])).toBe('scheduled')
    expect(rollupPostStatus([])).toBeNull()
  })
})

describe('retry i vreme', () => {
  it('pauze su 1, 5, 15 min i ne rastu dalje', () => {
    expect(retryDelayMs(1)).toBe(60_000)
    expect(retryDelayMs(2)).toBe(300_000)
    expect(retryDelayMs(3)).toBe(900_000)
    expect(retryDelayMs(9)).toBe(900_000)
  })
  it('sledeći pun minut sa rezervom; isti minut se poredi bez sekundi', () => {
    const now = new Date('2026-10-24T10:00:50.000Z')
    expect(nextFullMinute(now).toISOString()).toBe('2026-10-24T10:02:00.000Z')
    expect(sameMinute('2026-10-24T10:02:00.000Z', '2026-10-24T10:02:30+00:00')).toBe(true)
    expect(sameMinute('2026-10-24T10:02:00.000Z', '2026-10-24T10:03:00.000Z')).toBe(false)
    expect(sameMinute(null, '2026-10-24T10:03:00.000Z')).toBe(false)
  })
})

describe('classifyPublishError', () => {
  it('token i dozvole → reauth; kvota → quota; duplikat → duplicate', () => {
    expect(classifyPublishError(new ProviderError('TOKEN_INVALID')).kind).toBe('reauth')
    expect(classifyPublishError(new ProviderError('PERMISSION_LOST')).kind).toBe('reauth')
    expect(classifyPublishError(new ProviderError('QUOTA_EXCEEDED')).kind).toBe('quota')
    expect(classifyPublishError(new ProviderError('DUPLICATE')).kind).toBe('duplicate')
  })
  it('privremene greške mreže i pad fetch-a → retry; odbijen medij → permanent', () => {
    expect(classifyPublishError(new ProviderError('RATE_LIMITED')).kind).toBe('retry')
    expect(classifyPublishError(new ProviderError('PROVIDER_DOWN')).kind).toBe('retry')
    const net = classifyPublishError(new TypeError('fetch failed'))
    expect(net.kind).toBe('retry')
    expect(net.code).toBe('NETWORK')
    const media = classifyPublishError(
      new ProviderError('MEDIA_REJECTED', { userMessage: 'Slika je prevelika.' }),
    )
    expect(media).toMatchObject({ kind: 'permanent', code: 'MEDIA_REJECTED', message: 'Slika je prevelika.' })
    expect(classifyPublishError(new ApiError('INTERNAL', 'Potpisan link nije napravljen.')).kind).toBe(
      'permanent',
    )
  })
})
