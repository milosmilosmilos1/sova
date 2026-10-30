/**
 * Link iz poruke u Studiju (D-116): prvi http(s) ili www. link, i podaci o proizvodu iz JSON-LD-a
 * stranice (schema.org Product sa ponudom), da objava za proizvod ima tačan naziv i cenu.
 */
export function findLink(text: string): string | null {
  const match = text.match(/(?:https?:\/\/|www\.)[^\s<>"'«»]+/i)
  if (!match) return null
  let url = match[0].replace(/[.,;:!?)\]}»"']+$/, '')
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

export interface ProductFacts {
  name: string | null
  description: string | null
  price: string | null
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const amount = (v: unknown): string | null =>
  typeof v === 'number' ? String(v) : typeof v === 'string' && v.trim() ? v.trim() : null

function offerPrice(offers: unknown): string | null {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const currency = text(o.priceCurrency)
    const price = amount(o.price)
    const low = amount(o.lowPrice)
    const high = amount(o.highPrice)
    const value = price ?? (low && high && low !== high ? `${low}–${high}` : low)
    if (value) return currency ? `${value} ${currency}` : value
  }
  return null
}

export function productFromJsonLd(blocks: unknown[]): ProductFacts | null {
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object') continue
    const b = raw as Record<string, unknown>
    const types = Array.isArray(b['@type']) ? b['@type'] : [b['@type']]
    if (!types.some((t) => t === 'Product' || t === 'ProductGroup')) continue
    return { name: text(b.name), description: text(b.description), price: offerPrice(b.offers) }
  }
  return null
}
