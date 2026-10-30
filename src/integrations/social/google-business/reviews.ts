import 'server-only'

import { GoogleApiClient } from '@/integrations/social/google/client'
import type { InboxReview } from '@/integrations/social/meta/inbox'

/**
 * Recenzije Google poslovnog profila (D-117): My Business API v4 `reviews` i odgovor vlasnika
 * (`PUT …/reviews/{id}/reply`). Isti token i lokacija kao objave (nalog = lokacija, roditelj = nalog).
 */
const API = 'https://mybusiness.googleapis.com/v4'
const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }

interface GbpReview {
  reviewId: string
  reviewer?: { displayName?: string; isAnonymous?: boolean }
  starRating?: string
  comment?: string
  createTime?: string
  reviewReply?: { comment?: string; updateTime?: string }
}

function reviewsPath(accountId: string, locationId: string): string {
  return `${API}/accounts/${accountId}/locations/${locationId}/reviews`
}

export async function listGbpReviews(
  accessToken: string,
  accountId: string,
  locationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<InboxReview[]> {
  const client = new GoogleApiClient(accessToken, fetchImpl, 'Google poslovni profil')
  const res = await client.get<{ reviews?: GbpReview[] }>(
    `${reviewsPath(accountId, locationId)}?pageSize=50&orderBy=updateTime%20desc`,
  )
  return (res.reviews ?? []).map((r) => ({
    id: r.reviewId,
    text: r.comment ?? '',
    authorId: null,
    authorName: r.reviewer?.isAnonymous ? null : (r.reviewer?.displayName ?? null),
    authorHandle: null,
    createdAt: r.createTime ?? new Date().toISOString(),
    rating: r.starRating ? (STARS[r.starRating] ?? null) : null,
    replies: r.reviewReply?.comment
      ? [
          {
            id: `${r.reviewId}:reply`,
            text: r.reviewReply.comment,
            authorId: null,
            authorName: null,
            authorHandle: null,
            createdAt: r.reviewReply.updateTime ?? r.createTime ?? new Date().toISOString(),
          },
        ]
      : [],
  }))
}

/** Odgovor vlasnika na recenziju; Google čuva jedan odgovor po recenziji (novi zamenjuje stari). */
export async function replyGbpReview(
  accessToken: string,
  accountId: string,
  locationId: string,
  reviewId: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const client = new GoogleApiClient(accessToken, fetchImpl, 'Google poslovni profil')
  await client.request('PUT', `${reviewsPath(accountId, locationId)}/${reviewId}/reply`, {
    json: { comment: text },
  })
  return `${reviewId}:reply`
}
