import 'server-only'

import { ApiError } from '@/lib/api/errors'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export interface StoredObject {
  bucket: string
  storage_path: string
}

/**
 * Potpisani linkovi (D-164). Pozivi iz istog koraka (npr. `Promise.all` nad listom objava) skupljaju se u
 * jedan poziv Storage-u po bucket-u, umesto jednog HTTP poziva po slici. Link za pregled važi 2 h, a
 * isti link se daje ponovo prvih sat vremena: pregledač ga tada kešira, pa lista posle osvežavanja ne
 * skida slike iznova. Duži linkovi (mreže 24 h, linkovi za odobrenje) se ne ponavljaju.
 *
 * Link se pravi samo za objekat koji je pozivalac već pročitao kroz RLS (kao i ranije); isti link za dva
 * korisnika sa pristupom vredi isto kao dva nova potpisa.
 */
export const PREVIEW_URL_SEC = 2 * 3600
const REUSE_MS = (PREVIEW_URL_SEC * 1000) / 2
const MEMO_MAX = 5000

const memo = new Map<string, { url: string; until: number }>()

interface Waiter {
  resolve: (url: string) => void
  reject: (error: unknown) => void
}

interface Batch {
  bucket: string
  expiresSec: number
  paths: Map<string, Waiter[]>
}

const queue = new Map<string, Batch>()
let flushScheduled = false

function remember(key: string, url: string): void {
  memo.delete(key)
  memo.set(key, { url, until: Date.now() + REUSE_MS })
  if (memo.size > MEMO_MAX) {
    const oldest = memo.keys().next().value
    if (oldest !== undefined) memo.delete(oldest)
  }
}

function memoKey(bucket: string, path: string): string {
  return `${bucket}\n${path}`
}

async function signBatch(batch: Batch): Promise<void> {
  const paths = [...batch.paths.keys()]
  try {
    const { data, error } = await createSupabaseAdminClient()
      .storage.from(batch.bucket)
      .createSignedUrls(paths, batch.expiresSec)
    if (error) throw error
    const byPath = new Map((data ?? []).map((d) => [d.path, d]))
    for (const [path, waiters] of batch.paths) {
      const signed = byPath.get(path)
      if (signed && !signed.error && signed.signedUrl) {
        if (batch.expiresSec === PREVIEW_URL_SEC) remember(memoKey(batch.bucket, path), signed.signedUrl)
        for (const w of waiters) w.resolve(signed.signedUrl)
      } else {
        // npr. objekat ne postoji: odbija se samo taj link, kao ranije pojedinačni poziv
        const failure = new ApiError('INTERNAL', 'Potpisan link nije napravljen.', {
          cause: signed?.error ?? 'missing',
        })
        for (const w of waiters) w.reject(failure)
      }
    }
  } catch (error) {
    const failure = new ApiError('INTERNAL', 'Potpisan link nije napravljen.', { cause: error })
    for (const waiters of batch.paths.values()) for (const w of waiters) w.reject(failure)
  }
}

function flush(): void {
  flushScheduled = false
  const batches = [...queue.values()]
  queue.clear()
  for (const batch of batches) void signBatch(batch)
}

/** Potpisan URL; podrazumevano za pregled u aplikaciji (2 h). Mreže traže duži rok. */
export function signedUrl(asset: StoredObject, expiresSec = PREVIEW_URL_SEC): Promise<string> {
  if (expiresSec === PREVIEW_URL_SEC) {
    const hit = memo.get(memoKey(asset.bucket, asset.storage_path))
    if (hit && hit.until > Date.now()) return Promise.resolve(hit.url)
  }
  return new Promise((resolve, reject) => {
    const key = `${asset.bucket}\n${expiresSec}`
    let batch = queue.get(key)
    if (!batch) {
      batch = { bucket: asset.bucket, expiresSec, paths: new Map() }
      queue.set(key, batch)
    }
    const waiters = batch.paths.get(asset.storage_path)
    if (waiters) waiters.push({ resolve, reject })
    else batch.paths.set(asset.storage_path, [{ resolve, reject }])
    if (!flushScheduled) {
      flushScheduled = true
      // sačeka da svi pozivi iz istog koraka uđu u red, pa šalje jedan zahtev po bucket-u
      setImmediate(flush)
    }
  })
}
