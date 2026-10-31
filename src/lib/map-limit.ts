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
