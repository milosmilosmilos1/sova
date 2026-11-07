import 'server-only'

/**
 * Vrednost u memoriji instance koja se osvežava u pozadini (brzina, D-164). Do `freshMs` se vraća
 * keš. Posle toga se odmah vraća poslednja vrednost, a nova se čita bez čekanja. Zahtev čeka bazu tek
 * kad keša nema ili je stariji od `maxStaleMs`. Saobraćaj je mali i instance na Netlify-ju kratko žive,
 * pa je strogi keš od 60 s skoro uvek bio istekao i svaki zahtev je čekao krug do Frankfurta.
 */
export interface SwrCache<T> {
  get(): Promise<T>
  /** Sledeće čitanje ide u bazu (posle izmene u admin panelu, u testovima). */
  clear(): void
}

export interface SwrOptions<T> {
  freshMs: number
  maxStaleMs: number
  /** Kad čitanje ne uspe a keša nema: ova vrednost važi `errorTtlMs`, pa baza nije zasuta pokušajima. */
  fallback: () => T
  errorTtlMs: number
  onError: (error: unknown) => void
}

/** Lambda posle odgovora može da zamrzne čitanje koje se onda nikad ne završi; tada se kreće ispočetka. */
const INFLIGHT_MAX_MS = 15_000

export function swrCache<T>(load: () => Promise<T>, options: SwrOptions<T>): SwrCache<T> {
  let entry: { value: T; at: number } | null = null
  let inflight: { promise: Promise<T>; at: number } | null = null
  // clear() povećava generaciju: čitanje započeto pre brisanja (npr. pre izmene u admin panelu) ne
  // vraća staru vrednost u keš; isto važi za čitanje koje završi posle novijeg
  let generation = 0

  function refresh(): Promise<T> {
    const now = Date.now()
    if (inflight && now - inflight.at < INFLIGHT_MAX_MS) return inflight.promise
    const startedIn = generation
    const promise = load().then((value) => {
      if (startedIn === generation && (!entry || entry.at <= now)) entry = { value, at: now }
      return value
    })
    const current = { promise, at: now }
    inflight = current
    const done = () => {
      if (inflight === current) inflight = null
    }
    promise.then(done, done)
    return promise
  }

  return {
    async get() {
      const now = Date.now()
      if (entry && now - entry.at < options.freshMs) return entry.value
      if (entry && now - entry.at < options.maxStaleMs) {
        refresh().catch(options.onError)
        return entry.value
      }
      try {
        return await refresh()
      } catch (error) {
        options.onError(error)
        if (entry) return entry.value
        const value = options.fallback()
        // „svež” još errorTtlMs, pa sledeći zahtevi ne pokušavaju odmah ponovo
        entry = { value, at: Date.now() - options.freshMs + options.errorTtlMs }
        return value
      }
    },
    clear() {
      generation += 1
      entry = null
      inflight = null
    },
  }
}
