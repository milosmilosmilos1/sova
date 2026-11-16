import type { MonthPlanKindData } from '@/lib/ai/prompts/month-plan'
import { CONTENT_KINDS, kindState, type StoredContent } from '@/lib/schemas/brand-content'

import { isDataKind, type DataKind, type SlotKind } from './index'

const LABEL_PREFIX: Record<DataKind, string> = { review: 'U', team: 'T', before_after: 'P' }

/** Oznake stavki za upit plana (U1, T1, P1), redom kojim se pojavljuju u mesecu. */
export function refLabels(kinds: ReadonlyArray<SlotKind | null>): Map<string, string> {
  const counts = new Map<string, number>()
  const out = new Map<string, string>()
  for (const k of kinds) {
    if (!k?.ref || !isDataKind(k.kind) || out.has(k.ref)) continue
    const prefix = LABEL_PREFIX[k.kind]
    const n = (counts.get(prefix) ?? 0) + 1
    counts.set(prefix, n)
    out.set(k.ref, `${prefix}${n}`)
  }
  return out
}

/**
 * Podaci biznisa za upit jednog meseca plana (D-165): samo stavke dodeljene terminima tog meseca i
 * vrste koje je vlasnik isključio.
 */
export function planKindData(
  content: StoredContent,
  assigned: ReadonlyArray<SlotKind | null>,
): { data: MonthPlanKindData; labels: Map<string, string> } {
  const labels = refLabels(assigned)
  const order = (id: string) => Number(labels.get(id)!.slice(1))
  const pick = <T extends { id: string }>(items: T[]) =>
    items.filter((i) => labels.has(i.id)).sort((a, b) => order(a.id) - order(b.id))
  return {
    labels,
    data: {
      reviews: pick(content.testimonials).map((t) => ({
        label: labels.get(t.id)!,
        author: t.author,
        detail: t.detail,
        rating: t.rating,
        text: t.text,
      })),
      team: pick(content.team).map((m) => ({
        label: labels.get(m.id)!,
        name: m.name,
        role: m.role,
        bio: m.bio,
        funFact: m.funFact,
      })),
      pairs: pick(content.pairs).map((p) => ({ label: labels.get(p.id)!, title: p.title, note: p.note })),
      off: CONTENT_KINDS.filter((k) => kindState(content, k) === 'off'),
    },
  }
}
