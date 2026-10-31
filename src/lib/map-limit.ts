/**
 * `Promise.all` sa najviše `limit` poslova u isto vreme (D-122): fotografije se preuzimaju i čuvaju
 * paralelno, ali bez desetak istovremenih preuzimanja u jednoj funkciji. Rezultati su redom kao ulaz.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!, i)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return out
}

export interface Settled<T> {
  done: T[]
  failed: Array<{ item: T; error: unknown }>
  rest: T[]
}

/**
 * Kao `mapLimit`, ali greška jedne stavke ne prekida ostale, a stavka koja nije počela pre roka ostaje
 * u `rest` (D-126): Netlify prekida zahtev posle 30 sekundi, pa ostatak šalje klijent u sledećem
 * zahtevu. Svaki spisak je redom kao ulaz.
 */
export async function settleWithin<T>(
  items: readonly T[],
  limit: number,
  budgetMs: number,
  fn: (item: T) => Promise<unknown>,
): Promise<Settled<T>> {
  const deadline = Date.now() + budgetMs
  const outcomes = await mapLimit(items, limit, async (item) => {
    if (Date.now() >= deadline) return { kind: 'rest' as const }
    try {
      await fn(item)
      return { kind: 'done' as const }
    } catch (error) {
      return { kind: 'failed' as const, error }
    }
  })
  const out: Settled<T> = { done: [], failed: [], rest: [] }
  outcomes.forEach((o, i) => {
    const item = items[i]!
    if (o.kind === 'done') out.done.push(item)
    else if (o.kind === 'failed') out.failed.push({ item, error: o.error })
    else out.rest.push(item)
  })
  return out
}
