import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import { getDocumentProxy } from 'unpdf'

import { embedTexts } from '@/lib/ai/gemini'
import { embeddingModel } from '@/lib/ai/models'
import { callWithFallback } from '@/lib/ai/orchestrator'
import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { chunkText, estimateTokens } from '@/lib/crawler/chunk'
import { enqueueDocumentIndex } from '@/lib/jobs/enqueue'
import { logger } from '@/lib/logger'
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENTS, MAX_NOTES } from '@/lib/schemas/setup'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { EMBED_DIMENSIONS, isEmbeddingAvailable } from '@/services/brand-brain/embed'
import { getBrand } from '@/services/brands'
import type { Database, Json } from '@/types/database'

/**
 * Dokumenti o brendu (D-112): PDF ide pravo u skladište `brand-assets` preko potpisanog URL-a, server
 * proverava da je PDF i upisuje red „processing”, a pozadinski posao čita tekst (unpdf), deli ga na
 * odlomke i pamti u bazi znanja (`knowledge_chunks`, source_type 'manual'). Odatle ga koriste RAG pri
 * svakom generisanju i predlog glasa brenda. Beleška (D-113) je izvor bez fajla: tekst do 5.000 znakova
 * ide istim putem u bazu znanja.
 */
const BUCKET = 'brand-assets'
const MAX_PAGES = 150
const MAX_CHARS = 200_000
const MAX_CHUNKS = 80
const BATCH = 16

type DocumentRow = Database['public']['Tables']['brand_documents']['Row']

export interface DocumentView {
  id: string
  kind: 'pdf' | 'note'
  name: string
  /** početak beleške; za PDF null */
  excerpt: string | null
  sizeBytes: number
  pages: number | null
  chars: number
  chunks: number
  status: 'processing' | 'ready' | 'failed'
  error: string | null
  createdAt: string
}

function toView(row: DocumentRow): DocumentView {
  return {
    id: row.id,
    kind: row.kind === 'note' ? 'note' : 'pdf',
    name: row.name,
    excerpt: row.content ? row.content.slice(0, 200) : null,
    sizeBytes: row.size_bytes,
    pages: row.pages,
    chars: row.chars,
    chunks: row.chunks,
    status: row.status as DocumentView['status'],
    error: row.error,
    createdAt: row.created_at,
  }
}

function documentPath(workspaceId: string, brandId: string, id: string): string {
  return `ws/${workspaceId}/brand/${brandId}/documents/${id}.pdf`
}

async function activeCount(brandId: string, kind: 'pdf' | 'note' = 'pdf'): Promise<number> {
  const { count } = await createSupabaseAdminClient()
    .from('brand_documents')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .eq('kind', kind)
    .is('deleted_at', null)
  return count ?? 0
}

export async function listDocuments(viewer: Viewer, brandId: string): Promise<DocumentView[]> {
  const brand = await getBrand(viewer, brandId)
  const { data, error } = await viewer.supabase
    .from('brand_documents')
    .select('*')
    .eq('brand_id', brand.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw mapDbError(error)
  return (data ?? []).map(toView)
}

export interface DocumentUploadTarget {
  uploadId: string
  signedUrl: string
  maxBytes: number
}

/** Korak 1: potpisan URL za PUT (važi 2 h); ID i putanju bira server. */
export async function createDocumentUpload(
  viewer: Viewer,
  brandId: string,
  input: { name: string; sizeBytes: number },
): Promise<DocumentUploadTarget> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  if (input.sizeBytes > MAX_DOCUMENT_BYTES)
    throw new ApiError('PAYLOAD_TOO_LARGE', 'PDF može imati najviše 10 MB.')
  if ((await activeCount(brand.id)) >= MAX_DOCUMENTS)
    throw new ApiError(
      'PLAN_LIMIT',
      `Brend može imati najviše ${MAX_DOCUMENTS} dokumenata. Obrišite neki stari.`,
    )
  const uploadId = randomUUID()
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(BUCKET)
    .createSignedUploadUrl(documentPath(brand.workspace_id, brand.id, uploadId))
  if (error || !data)
    throw new ApiError('INTERNAL', 'Adresa za otpremanje nije napravljena.', { cause: error })
  return { uploadId, signedUrl: data.signedUrl, maxBytes: MAX_DOCUMENT_BYTES }
}

/**
 * Korak 2: fajl mora biti PDF do 10 MB; upisuje se red „processing” i šalje pozadinski posao.
 * Ponovljen poziv za isti `uploadId` vraća postojeći red.
 */
export async function completeDocument(
  viewer: Viewer,
  brandId: string,
  input: { uploadId: string; name: string },
): Promise<DocumentView> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  const admin = createSupabaseAdminClient()
  const { data: existing } = await admin
    .from('brand_documents')
    .select('*')
    .eq('id', input.uploadId)
    .eq('brand_id', brand.id)
    .maybeSingle()
  if (existing) return toView(existing)

  const path = documentPath(brand.workspace_id, brand.id, input.uploadId)
  const { data: blob, error } = await admin.storage.from(BUCKET).download(path)
  if (error || !blob) {
    throw new ApiError(
      'NOT_FOUND',
      'Otpremljeni fajl nije pronađen: otpremanje nije završeno ili je prošlo više od dva sata.',
    )
  }
  const bytes = Buffer.from(await blob.arrayBuffer())
  const reject = async (message: string, code: 'VALIDATION' | 'PAYLOAD_TOO_LARGE' = 'VALIDATION') => {
    await admin.storage.from(BUCKET).remove([path])
    return new ApiError(code, message)
  }
  if (bytes.length > MAX_DOCUMENT_BYTES)
    throw await reject('PDF može imati najviše 10 MB.', 'PAYLOAD_TOO_LARGE')
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw await reject('Fajl nije PDF.')
  if ((await activeCount(brand.id)) >= MAX_DOCUMENTS)
    throw await reject(`Brend može imati najviše ${MAX_DOCUMENTS} dokumenata. Obrišite neki stari.`)

  const { data: row, error: insertError } = await admin
    .from('brand_documents')
    .insert({
      id: input.uploadId,
      brand_id: brand.id,
      workspace_id: brand.workspace_id,
      name: input.name.slice(0, 200),
      storage_path: path,
      size_bytes: bytes.length,
      status: 'processing',
      uploaded_by: viewer.user.id,
    })
    .select('*')
    .single()
  if (insertError) throw mapDbError(insertError)
  try {
    await enqueueDocumentIndex(row.id, brand.id)
  } catch (error) {
    await admin
      .from('brand_documents')
      .update({
        status: 'failed',
        error: 'Pozadinski servis nije dostupan. Obrišite dokument i pokušajte ponovo.',
      })
      .eq('id', row.id)
    throw error
  }
  return toView(row)
}

/** Beleška (D-113): ručni izvor bez fajla; tekst ide u bazu znanja istim pozadinskim poslom kao PDF. */
export async function createNote(
  viewer: Viewer,
  brandId: string,
  input: { title: string; content: string },
): Promise<DocumentView> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  if (!viewer.profile.emailVerifiedAt) throw new ApiError('EMAIL_NOT_VERIFIED')
  if ((await activeCount(brand.id, 'note')) >= MAX_NOTES)
    throw new ApiError('PLAN_LIMIT', `Brend može imati najviše ${MAX_NOTES} beleški. Obrišite neku staru.`)
  const admin = createSupabaseAdminClient()
  const { data: row, error } = await admin
    .from('brand_documents')
    .insert({
      brand_id: brand.id,
      workspace_id: brand.workspace_id,
      kind: 'note',
      name: input.title,
      content: input.content,
      size_bytes: Buffer.byteLength(input.content, 'utf8'),
      status: 'processing',
      uploaded_by: viewer.user.id,
    })
    .select('*')
    .single()
  if (error) throw mapDbError(error)
  try {
    await enqueueDocumentIndex(row.id, brand.id)
  } catch (err) {
    await markFailed(row.id, 'Pozadinski servis nije dostupan. Obrišite belešku i pokušajte ponovo.')
    throw err
  }
  return toView(row)
}

export async function deleteDocument(viewer: Viewer, brandId: string, documentId: string): Promise<void> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const admin = createSupabaseAdminClient()
  const { data: row } = await admin
    .from('brand_documents')
    .select('*')
    .eq('id', documentId)
    .eq('brand_id', brand.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!row) throw new ApiError('NOT_FOUND', 'Dokument ne postoji.')
  await admin
    .from('knowledge_chunks')
    .delete()
    .eq('brand_id', brand.id)
    .eq('source_type', 'manual')
    .eq('source_id', row.id)
  if (row.storage_path) await admin.storage.from(BUCKET).remove([row.storage_path])
  const { error } = await admin
    .from('brand_documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', row.id)
  if (error) throw mapDbError(error)
}

/** Tekst PDF-a, najviše `MAX_PAGES` strana i `MAX_CHARS` znakova (pdf.js 6 ne izvršava kod iz fajla). */
export async function extractPdfText(bytes: Uint8Array): Promise<{ pages: number; text: string }> {
  const pdf = await getDocumentProxy(bytes, {
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
    verbosity: 0,
  })
  try {
    const pages = pdf.numPages
    const parts: string[] = []
    let chars = 0
    for (let i = 1; i <= Math.min(pages, MAX_PAGES) && chars < MAX_CHARS; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      let text = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        text += item.str + (item.hasEOL ? '\n' : ' ')
      }
      const clean = text
        .replace(/[ \t ]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      if (clean) {
        parts.push(clean)
        chars += clean.length
      }
      page.cleanup()
    }
    return { pages, text: parts.join('\n\n').slice(0, MAX_CHARS) }
  } finally {
    await pdf.loadingTask.destroy()
  }
}

async function markFailed(id: string, message: string): Promise<void> {
  await createSupabaseAdminClient()
    .from('brand_documents')
    .update({ status: 'failed', error: message })
    .eq('id', id)
}

/**
 * Pozadinski posao: tekst → odlomci → embeddingi. Greška u fajlu (šifrovan, oštećen, bez teksta)
 * završava kao „failed” sa porukom; greška AI servisa se baca da bi Inngest pokušao ponovo.
 */
export async function indexDocument(
  documentId: string,
): Promise<{ status: 'ready' | 'failed' | 'skipped'; chunks: number }> {
  const admin = createSupabaseAdminClient()
  const { data: row } = await admin.from('brand_documents').select('*').eq('id', documentId).maybeSingle()
  if (!row || row.deleted_at || row.status !== 'processing') return { status: 'skipped', chunks: 0 }
  if (!isEmbeddingAvailable()) {
    await markFailed(row.id, 'AI servis nije podešen, dokument nije pročitan.')
    return { status: 'failed', chunks: 0 }
  }
  let extracted: { pages: number | null; text: string }
  try {
    if (row.kind === 'note') extracted = { pages: null, text: (row.content ?? '').trim() }
    else {
      const { data: blob, error } = row.storage_path
        ? await admin.storage.from(BUCKET).download(row.storage_path)
        : { data: null, error: true }
      if (error || !blob) {
        await markFailed(row.id, 'Fajl nije pronađen u skladištu.')
        return { status: 'failed', chunks: 0 }
      }
      extracted = await extractPdfText(new Uint8Array(await blob.arrayBuffer()))
    }
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    logger.warn('brand_document_parse_failed', { documentId, name })
    await markFailed(
      row.id,
      name === 'PasswordException'
        ? 'PDF je zaključan lozinkom.'
        : 'PDF je oštećen ili ga nije moguće pročitati.',
    )
    return { status: 'failed', chunks: 0 }
  }
  if (row.kind !== 'note' && extracted.text.length < 80) {
    await admin
      .from('brand_documents')
      .update({
        status: 'failed',
        pages: extracted.pages,
        chars: extracted.text.length,
        error: 'U PDF-u nema teksta (verovatno su strane skenirane kao slike).',
      })
      .eq('id', row.id)
    return { status: 'failed', chunks: 0 }
  }

  const header = row.name.replace(/\.pdf$/i, '')
  const chunks = chunkText(extracted.text, { max: MAX_CHUNKS })
  // kratka beleška (ispod 40 znakova) je jedan odlomak, jer je i to činjenica koju Sova treba da zna
  if (!chunks.length && extracted.text)
    chunks.push({ index: 0, content: extracted.text, tokenEstimate: estimateTokens(extracted.text) })
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH)
    const outcome = await callWithFallback(
      [await embeddingModel()],
      (model) =>
        embedTexts({
          model,
          texts: batch.map((c) => `${header}\n\n${c.content}`),
          dimensions: EMBED_DIMENSIONS,
          taskType: 'RETRIEVAL_DOCUMENT',
        }),
      { label: 'document-embed', attempts: 3 },
    )
    const rows = batch.map((c, j) => ({
      brand_id: row.brand_id,
      source_type: 'manual',
      source_id: row.id,
      chunk_index: c.index,
      content: c.content,
      token_count: c.tokenEstimate,
      embedding: `[${outcome.result.vectors[j]!.join(',')}]`,
      metadata: { title: row.name, document_id: row.id } as NonNullable<Json>,
      content_hash: createHash('sha256').update(c.content).digest('hex'),
    }))
    const { error: upErr } = await admin
      .from('knowledge_chunks')
      .upsert(rows, { onConflict: 'brand_id,source_type,source_id,chunk_index' })
    if (upErr) throw upErr
  }
  await admin
    .from('brand_documents')
    .update({
      status: 'ready',
      error: null,
      pages: extracted.pages,
      chars: extracted.text.length,
      chunks: chunks.length,
    })
    .eq('id', row.id)
  logger.info('brand_document_indexed', { documentId, pages: extracted.pages, chunks: chunks.length })
  return { status: 'ready', chunks: chunks.length }
}
