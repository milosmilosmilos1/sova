import { z } from 'zod'

/**
 * Playbook brenda (D-113): šta je Brain naučio iz rezultata objava. Piše ga nedeljni poziv za uvide
 * (isti poziv, bez dodatnog troška), a prompt ga koristi u svakom nacrtu. Ne uređuje se ručno.
 */
export const PLAYBOOK_WORKS_MAX = 6
export const PLAYBOOK_AVOID_MAX = 4
const RULE_MAX = 160
const SUMMARY_MAX = 240

export interface Playbook {
  summary: string
  works: string[]
  avoid: string[]
  updatedAt: string | null
  insightId: string | null
  basedOn: { posts: number; from: string; to: string } | null
}

const storedSchema = z.object({
  summary: z.string().default(''),
  works: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  updated_at: z.string().nullable().default(null),
  insight_id: z.string().nullable().default(null),
  based_on: z.object({ posts: z.number(), from: z.string(), to: z.string() }).nullable().default(null),
})

/** Sačuvan playbook iz `brands.playbook`; prazan ili neispravan je null. */
export function parsePlaybook(raw: unknown): Playbook | null {
  const parsed = storedSchema.safeParse(raw ?? {})
  if (!parsed.success) return null
  const p = parsed.data
  if (!p.summary && !p.works.length && !p.avoid.length) return null
  return {
    summary: p.summary,
    works: p.works,
    avoid: p.avoid,
    updatedAt: p.updated_at,
    insightId: p.insight_id,
    basedOn: p.based_on,
  }
}

function clean(text: string, max: number): string {
  const t = text
    .replace(/^[-•\d.)\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

function unique(items: string[], exclude: Set<string>, max: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    const item = clean(raw, RULE_MAX)
    const key = item.toLocaleLowerCase()
    if (item.length < 3 || seen.has(key) || exclude.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= max) break
  }
  return out
}

/**
 * Nov zaključak iz rezultata ide na vrh, staro pravilo ostaje dok ima mesta. Pravilo koje nova
 * analiza stavlja na suprotnu stranu (radi ↔ izbegavati) briše se iz stare liste.
 */
export function mergePlaybook(
  prev: Playbook | null,
  next: { summary: string; works: string[]; avoid: string[] },
  meta: { insightId: string; posts: number; from: string; to: string; now?: Date },
): Playbook {
  const key = (s: string) => clean(s, RULE_MAX).toLocaleLowerCase()
  const newWorks = new Set(next.works.map(key))
  const newAvoid = new Set(next.avoid.map(key))
  return {
    summary: clean(next.summary, SUMMARY_MAX) || prev?.summary || '',
    works: unique([...next.works, ...(prev?.works ?? [])], newAvoid, PLAYBOOK_WORKS_MAX),
    avoid: unique([...next.avoid, ...(prev?.avoid ?? [])], newWorks, PLAYBOOK_AVOID_MAX),
    updatedAt: (meta.now ?? new Date()).toISOString(),
    insightId: meta.insightId,
    basedOn: { posts: meta.posts, from: meta.from, to: meta.to },
  }
}

/** Oblik za `brands.playbook` (snake_case kao ostale JSON kolone). */
export function storedPlaybook(p: Playbook): Record<string, unknown> {
  return {
    summary: p.summary,
    works: p.works,
    avoid: p.avoid,
    updated_at: p.updatedAt,
    insight_id: p.insightId,
    based_on: p.basedOn,
  }
}
