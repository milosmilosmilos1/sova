import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { requireMembership } from '@/lib/auth/workspace'
import { settleWithin } from '@/lib/map-limit'
import { availableActions, type PostStatus } from '@/lib/posts/state-machine'
import { deleteMediaAsset } from '@/services/media'
import { deletePost, loadPost } from '@/services/posts/posts'
import { skip } from '@/services/posts/review'
import { cancel, withdraw } from '@/services/posts/workflow'

/**
 * Radnje nad više stavki odjednom (D-119): svaka stavka ide kroz iste provere kao pojedinačna
 * radnja (uloga, status), pa jedna greška ne zaustavlja ostale; odgovor kaže šta nije uspelo i zašto.
 * Stavke idu po šest u isto vreme, a ono što ne počne za 20 sekundi vraća se u `rest` i klijent ga
 * šalje u sledećem zahtevu (D-126): Netlify prekida zahtev posle 30 sekundi.
 */
export interface BulkResult {
  done: string[]
  failed: Array<{ id: string; message: string }>
  rest: string[]
}

const LIVE = new Set(['publishing', 'published', 'partially_published'])
const BULK_PARALLEL = 6
const BULK_BUDGET_MS = 20_000

/**
 * Brisanje objave: sa odobravanja se prvo vraća u nacrte, zakazana i odobrena se prvo otkazuje.
 * Briše vlasnik ili administrator; urednik može samo da otkaže (objava ostaje među otkazanim).
 * Status i verzija se čitaju iz reda objave, bez punog prikaza sa potpisanim linkom za svaki slajd.
 */
async function removePost(viewer: Viewer, postId: string): Promise<void> {
  const post = await loadPost(viewer, postId)
  const { role } = await requireMembership(viewer, post.workspace_id)
  let status: PostStatus = post.status
  let version = post.version
  if (LIVE.has(status))
    throw new ApiError('CONFLICT', 'Objavljena objava se ne briše iz Sove. Obrišite je na mreži.')
  if (status === 'in_review') {
    version = await withdraw(viewer, postId, version)
    status = 'draft'
  }
  if (['approved', 'scheduled', 'paused'].includes(status)) {
    version = await cancel(viewer, postId, version)
    status = 'canceled'
  }
  const actions = availableActions(status, role)
  if (actions.includes('delete')) return deletePost(viewer, postId)
  if (status !== 'canceled' && actions.includes('cancel')) {
    await cancel(viewer, postId, version)
    return
  }
  throw new ApiError('FORBIDDEN', 'Brisanje može vlasnik ili administrator radnog prostora.')
}

async function each(ids: string[], action: (id: string) => Promise<unknown>): Promise<BulkResult> {
  const r = await settleWithin([...new Set(ids)], BULK_PARALLEL, BULK_BUDGET_MS, action)
  return {
    done: r.done,
    failed: r.failed.map(({ item, error }) => ({
      id: item,
      message: error instanceof Error ? error.message : 'Radnja nije uspela.',
    })),
    rest: r.rest,
  }
}

export async function bulkPosts(
  viewer: Viewer,
  ids: string[],
  action: 'delete' | 'skip',
): Promise<BulkResult> {
  return each(ids, (id) => (action === 'delete' ? removePost(viewer, id) : skip(viewer, id)))
}

/** Brisanje fotografija iz galerije; fotografija u zakazanoj objavi se ne briše (čuvar u bazi). */
export async function bulkDeleteMedia(viewer: Viewer, brandId: string, ids: string[]): Promise<BulkResult> {
  return each(ids, (id) => deleteMediaAsset(viewer, id, brandId))
}
