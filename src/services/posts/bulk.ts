import 'server-only'

import { ApiError } from '@/lib/api/errors'
import type { Viewer } from '@/lib/auth/viewer'
import { deleteMediaAsset } from '@/services/media'
import { deletePost, getPostView } from '@/services/posts/posts'
import { skipPost } from '@/services/posts/review'
import { cancelPost, withdrawFromReview } from '@/services/posts/workflow'

/**
 * Radnje nad više stavki odjednom (D-119): svaka stavka ide kroz iste provere kao pojedinačna
 * radnja (uloga, status), pa jedna greška ne zaustavlja ostale; odgovor kaže šta nije uspelo i zašto.
 */
export interface BulkResult {
  done: string[]
  failed: Array<{ id: string; message: string }>
}

const LIVE = new Set(['publishing', 'published', 'partially_published'])

/**
 * Brisanje objave: sa odobravanja se prvo vraća u nacrte, zakazana i odobrena se prvo otkazuje.
 * Briše vlasnik ili administrator; urednik može samo da otkaže (objava ostaje među otkazanim).
 */
async function removePost(viewer: Viewer, postId: string): Promise<void> {
  let view = await getPostView(viewer, postId)
  if (LIVE.has(view.status))
    throw new ApiError('CONFLICT', 'Objavljena objava se ne briše iz Sove. Obrišite je na mreži.')
  if (view.status === 'in_review') view = await withdrawFromReview(viewer, postId, view.version)
  if (['approved', 'scheduled', 'paused'].includes(view.status))
    view = await cancelPost(viewer, postId, view.version)
  if (view.actions.includes('delete')) return deletePost(viewer, postId)
  if (view.status !== 'canceled' && view.actions.includes('cancel')) {
    await cancelPost(viewer, postId, view.version)
    return
  }
  throw new ApiError('FORBIDDEN', 'Brisanje može vlasnik ili administrator radnog prostora.')
}

async function each(ids: string[], action: (id: string) => Promise<unknown>): Promise<BulkResult> {
  const result: BulkResult = { done: [], failed: [] }
  for (const id of [...new Set(ids)]) {
    try {
      await action(id)
      result.done.push(id)
    } catch (error) {
      result.failed.push({ id, message: error instanceof Error ? error.message : 'Radnja nije uspela.' })
    }
  }
  return result
}

export async function bulkPosts(
  viewer: Viewer,
  ids: string[],
  action: 'delete' | 'skip',
): Promise<BulkResult> {
  return each(ids, async (id) => {
    if (action === 'delete') return removePost(viewer, id)
    const view = await getPostView(viewer, id)
    return skipPost(viewer, id, view.version)
  })
}

/** Brisanje fotografija iz galerije; fotografija u zakazanoj objavi se ne briše (čuvar u bazi). */
export async function bulkDeleteMedia(viewer: Viewer, brandId: string, ids: string[]): Promise<BulkResult> {
  return each(ids, (id) => deleteMediaAsset(viewer, id, brandId))
}
