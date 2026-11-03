import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { reloadForNewVersion } from './stale-deploy'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('stara strana posle nove objave (D-141)', () => {
  it('osveži stranu samo kad server ne prepozna radnju, i najviše jednom u minutu', () => {
    const reload = vi.fn()
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
      location: { reload },
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
    })
    expect(reloadForNewVersion(new Error('druga greška'), 1_000_000)).toBe(false)
    const stale = new UnrecognizedActionError('Server Action "abc" was not found on the server.')
    expect(reloadForNewVersion(stale, 1_000_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reloadForNewVersion(stale, 1_030_000)).toBe(false)
    expect(reloadForNewVersion(stale, 1_070_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })
})
