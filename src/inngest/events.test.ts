import { describe, expect, it } from 'vitest'

import { events, targetScheduledEvent } from './events'

const data = {
  targetId: '70d45aaa-1c37-4f9f-806a-f2a4d0b8f46e',
  version: 7,
  socialAccountId: '0b6f3c2e-6f0a-4c56-9d0e-6a1f2b3c4d5e',
}

describe('signal „target zakazan” (D-140)', () => {
  it('vreme iz baze (+00:00) svodi na ISO sa Z, koji provera signala prihvata', async () => {
    // zamka: tako vreme stiže iz baze, a Inngest ga odbija pri slanju
    const raw = events.postTargetScheduled.create({ ...data, scheduledAt: '2026-11-02T16:05:00+00:00' })
    await expect(raw.validate()).rejects.toThrow(/Invalid ISO datetime/)

    const ev = targetScheduledEvent({ ...data, scheduledAt: '2026-11-02T16:05:00+00:00' })
    expect(ev.data.scheduledAt).toBe('2026-11-02T16:05:00.000Z')
    await expect(ev.validate()).resolves.not.toThrow()
    expect(targetScheduledEvent({ ...data, scheduledAt: '2026-11-02T16:05:00.000Z' }).data.scheduledAt).toBe(
      '2026-11-02T16:05:00.000Z',
    )
  })
})
