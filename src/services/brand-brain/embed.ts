import 'server-only'

import { createHash } from 'node:crypto'

import { isAiError } from '@/lib/ai/errors'
import { embedTexts } from '@/lib/ai/gemini'
import { embeddingModel } from '@/lib/ai/models'
import { callWithFallback } from '@/lib/ai/orchestrator'
import { chunkText } from '@/lib/crawler/chunk'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/database'

/**
 * RAG sloj (brif 5.4): stranice sajta → chunkovi → embeddingi u knowledge_chunks (pgvector, 1536).
 * Bez Gemini ključa indeksiranje se preskače, a pretraga vraća prazan niz; generisanje radi i bez RAG-a.
 */
export const EMBED_DIMENSIONS = 1536
const BATCH = 16

export function isEmbeddingAvailable(): boolean {
  return Boolean(env.GEMINI_API_KEY)
}

export interface IndexResult {
  indexed: number
  skipped: number
  removed: number
  pages: number
  embedded: boolean
  reason?: string
  usage: { inputTokens: number }
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`
}

function hashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/** Indeksira sve stranice brenda iz date analize; nepromenjeni chunkovi se ne šalju ponovo. */
export async function indexBrandPages(brandId: string, crawlId: string): Promise<IndexResult> {
  const admin = createSupabaseAdminClient()
  const { data: pages, error } = await admin
    .from('website_pages')
    .select('id, url, page_type, title, text_content, published_at')
    .eq('brand_id', brandId)
    .eq('crawl_id', crawlId)
  if (error) throw error
  const usable = (pages ?? []).filter((p) => (p.text_content ?? '').trim().length >= 80)
  const base: IndexResult = {
    indexed: 0,
    skipped: 0,
    removed: 0,
    pages: usable.length,
    embedded: false,
    usage: { inputTokens: 0 },
  }
  if (!isEmbeddingAvailable()) return { ...base, reason: 'AI servis nije podešen (nedostaje ključ).' }
  if (!usable.length) return { ...base, embedded: true, reason: 'Nema stranica sa dovoljno teksta.' }

  const { data: existingRows } = await admin
    .from('knowledge_chunks')
    .select('id, source_id, chunk_index, content_hash')
    .eq('brand_id', brandId)
    .in('source_type', ['page', 'blog_post'])
  const existing = new Map<string, { id: string; hash: string }>()
  for (const r of existingRows ?? [])
    existing.set(`${r.source_id}:${r.chunk_index}`, { id: r.id, hash: r.content_hash })

  type Pending = {
    pageId: string
    index: number
    content: string
    hash: string
    metadata: NonNullable<Json>
    sourceType: 'page' | 'blog_post'
    tokens: number
  }
  const pending: Pending[] = []
  const keep = new Set<string>()
  for (const p of usable) {
    const header = p.title ? `${p.title}\n\n` : ''
    const chunks = chunkText(`${header}${p.text_content ?? ''}`)
    const sourceType = p.page_type === 'blog_post' ? 'blog_post' : 'page'
    for (const c of chunks) {
      const key = `${p.id}:${c.index}`
      keep.add(key)
      const hash = hashOf(c.content)
      const prev = existing.get(key)
      if (prev && prev.hash === hash) {
        base.skipped++
        continue
      }
      pending.push({
        pageId: p.id,
        index: c.index,
        content: c.content,
        hash,
        tokens: c.tokenEstimate,
        sourceType,
        metadata: {
          url: p.url,
          title: p.title,
          page_type: p.page_type,
          published_at: p.published_at,
        } as NonNullable<Json>,
      })
    }
  }

  // ukloni chunkove stranica kojih više nema ili viška indeksa
  const stale = [...existing.entries()].filter(([key]) => !keep.has(key)).map(([, v]) => v.id)
  if (stale.length) {
    const { error: delErr } = await admin.from('knowledge_chunks').delete().in('id', stale)
    if (!delErr) base.removed = stale.length
  }

  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH)
    const outcome = await callWithFallback(
      [embeddingModel()],
      (model) =>
        embedTexts({
          model,
          texts: batch.map((b) => b.content),
          dimensions: EMBED_DIMENSIONS,
          taskType: 'RETRIEVAL_DOCUMENT',
        }),
      { label: 'brand-embed', attempts: 3 },
    )
    base.usage.inputTokens += outcome.result.usage.inputTokens
    const rows = batch.map((b, j) => ({
      brand_id: brandId,
      source_type: b.sourceType,
      source_id: b.pageId,
      chunk_index: b.index,
      content: b.content,
      token_count: b.tokens,
      embedding: toVectorLiteral(outcome.result.vectors[j]!),
      metadata: b.metadata,
      content_hash: b.hash,
    }))
    const { error: upErr } = await admin
      .from('knowledge_chunks')
      .upsert(rows, { onConflict: 'brand_id,source_type,source_id,chunk_index' })
    if (upErr) throw upErr
    base.indexed += rows.length
  }
  base.embedded = true
  logger.info('brand_embed_done', { brandId, crawlId, ...base })
  return base
}

export interface KnowledgeHit {
  content: string
  similarity: number
  url: string | null
  title: string | null
  sourceType: string
}

/** Semantička pretraga znanja brenda; prazno kad AI nije podešen ili nema indeksa. */
export async function searchKnowledge(brandId: string, query: string, limit = 5): Promise<KnowledgeHit[]> {
  if (!isEmbeddingAvailable() || !query.trim()) return []
  const admin = createSupabaseAdminClient()
  // brend bez indeksa: bez poziva embedding modela
  if ((await countKnowledge(brandId)) === 0) return []
  try {
    const { vectors } = await embedTexts({
      model: embeddingModel(),
      texts: [query.slice(0, 4000)],
      dimensions: EMBED_DIMENSIONS,
      taskType: 'RETRIEVAL_QUERY',
      timeoutMs: 10_000,
    })
    const { data, error } = await admin.rpc('match_knowledge_chunks', {
      p_brand_id: brandId,
      p_embedding: toVectorLiteral(vectors[0]!),
      p_limit: limit,
    })
    if (error) throw error
    return (data ?? [])
      .filter((r) => r.similarity >= 0.45)
      .map((r) => {
        const meta = (r.metadata ?? {}) as { url?: string; title?: string }
        return {
          content: r.content,
          similarity: r.similarity,
          url: meta.url ?? null,
          title: meta.title ?? null,
          sourceType: r.source_type,
        }
      })
  } catch (error) {
    logger.warn('knowledge_search_failed', { brandId, code: isAiError(error) ? error.code : 'db', error })
    return []
  }
}

export async function countKnowledge(brandId: string): Promise<number> {
  const admin = createSupabaseAdminClient()
  const { count } = await admin
    .from('knowledge_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
  return count ?? 0
}
