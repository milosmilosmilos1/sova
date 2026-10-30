import 'server-only'

import { env } from '@/lib/env'

import { GraphClient } from './graph'

/**
 * Inbox na Meti (D-117): komentari na objavama stranice i Instagram naloga, razgovori (Instagram i
 * Messenger kroz stranicu) i preporuke stranice, uz isti Page token kao objave. Odgovor na komentar,
 * poruka u razgovoru i privatni odgovor na komentar (`recipient.comment_id`, jednom po komentaru,
 * do sedam dana posle komentara). Dozvole: instagram_manage_comments, pages_read_user_content,
 * pages_manage_engagement, instagram_manage_messages, pages_messaging.
 */
export const META_INBOX_SCOPES = [
  'pages_manage_engagement',
  'pages_messaging',
  'instagram_manage_messages',
] as const

export interface InboxEntry {
  id: string
  text: string
  authorId: string | null
  authorName: string | null
  authorHandle: string | null
  createdAt: string
}

export interface InboxComment extends InboxEntry {
  postId: string
  postPermalink: string | null
  postExcerpt: string | null
  replies: InboxEntry[]
}

export interface InboxConversation {
  id: string
  participant: { id: string; name: string | null; handle: string | null } | null
  updatedAt: string
  messages: Array<InboxEntry & { outbound: boolean }>
}

export interface InboxReview extends InboxEntry {
  rating: number | null
  replies: InboxEntry[]
}

interface IgComment {
  id: string
  text?: string
  timestamp?: string
  username?: string
  from?: { id?: string; username?: string }
  replies?: { data?: IgComment[] }
}

interface FbComment {
  id: string
  message?: string
  created_time?: string
  from?: { id?: string; name?: string }
  comments?: { data?: FbComment[] }
}

const excerpt = (s: string | undefined | null) => (s ? s.replace(/\s+/g, ' ').trim().slice(0, 300) : null)

function igEntry(c: IgComment): InboxEntry {
  const handle = c.from?.username ?? c.username ?? null
  return {
    id: c.id,
    text: c.text ?? '',
    authorId: c.from?.id ?? null,
    authorName: handle,
    authorHandle: handle,
    createdAt: c.timestamp ?? new Date().toISOString(),
  }
}

function fbEntry(c: FbComment): InboxEntry {
  return {
    id: c.id,
    text: c.message ?? '',
    authorId: c.from?.id ?? null,
    authorName: c.from?.name ?? null,
    authorHandle: null,
    createdAt: c.created_time ?? new Date().toISOString(),
  }
}

export interface MetaInboxOptions {
  fetchImpl?: typeof fetch
}

export class MetaInbox {
  constructor(
    private readonly accessToken: string,
    private readonly options: MetaInboxOptions = {},
  ) {}

  private client(): GraphClient {
    return new GraphClient(this.accessToken, {
      version: env.META_GRAPH_VERSION,
      fetchImpl: this.options.fetchImpl,
    })
  }

  /** Komentari na poslednjim objavama Instagram naloga (samo objave koje imaju komentare). */
  async instagramComments(igUserId: string, mediaLimit = 12): Promise<InboxComment[]> {
    const g = this.client()
    const media = await g.get<{
      data?: Array<{ id: string; caption?: string; permalink?: string; comments_count?: number }>
    }>(`${igUserId}/media`, { fields: 'id,caption,permalink,comments_count', limit: mediaLimit })
    const out: InboxComment[] = []
    for (const m of media.data ?? []) {
      if (!m.comments_count) continue
      const res = await g.get<{ data?: IgComment[] }>(`${m.id}/comments`, {
        fields:
          'id,text,timestamp,username,from{id,username},replies{id,text,timestamp,username,from{id,username}}',
        limit: 50,
      })
      for (const c of res.data ?? [])
        out.push({
          ...igEntry(c),
          postId: m.id,
          postPermalink: m.permalink ?? null,
          postExcerpt: excerpt(m.caption),
          replies: (c.replies?.data ?? []).map(igEntry),
        })
    }
    return out
  }

  /** Komentari na poslednjim objavama stranice. */
  async facebookComments(pageId: string, postLimit = 12): Promise<InboxComment[]> {
    const g = this.client()
    const posts = await g.get<{ data?: Array<{ id: string; message?: string; permalink_url?: string }> }>(
      `${pageId}/posts`,
      { fields: 'id,message,permalink_url', limit: postLimit },
    )
    const out: InboxComment[] = []
    for (const p of posts.data ?? []) {
      const res = await g.get<{ data?: FbComment[] }>(`${p.id}/comments`, {
        fields: 'id,message,created_time,from{id,name},comments{id,message,created_time,from{id,name}}',
        order: 'reverse_chronological',
        limit: 50,
      })
      for (const c of res.data ?? [])
        out.push({
          ...fbEntry(c),
          postId: p.id,
          postPermalink: p.permalink_url ?? null,
          postExcerpt: excerpt(p.message),
          replies: (c.comments?.data ?? []).map(fbEntry),
        })
    }
    return out
  }

  /** Razgovori stranice: Instagram poruke (`platform=instagram`) ili Messenger. */
  async conversations(
    pageId: string,
    platform: 'instagram' | 'messenger',
    selfId: string,
  ): Promise<InboxConversation[]> {
    const res = await this.client().get<{
      data?: Array<{
        id: string
        updated_time?: string
        participants?: { data?: Array<{ id: string; name?: string; username?: string }> }
        messages?: {
          data?: Array<{
            id: string
            message?: string
            created_time?: string
            from?: { id?: string; name?: string; username?: string }
          }>
        }
      }>
    }>(`${pageId}/conversations`, {
      platform,
      fields: 'id,updated_time,participants,messages.limit(20){id,message,created_time,from}',
      limit: 25,
    })
    return (res.data ?? []).map((c) => {
      const other = (c.participants?.data ?? []).find((p) => p.id !== selfId && p.id !== pageId) ?? null
      return {
        id: c.id,
        participant: other
          ? { id: other.id, name: other.name ?? other.username ?? null, handle: other.username ?? null }
          : null,
        updatedAt: c.updated_time ?? new Date().toISOString(),
        messages: (c.messages?.data ?? []).map((m) => {
          const outbound = m.from?.id === selfId || m.from?.id === pageId
          return {
            id: m.id,
            text: m.message ?? '',
            authorId: m.from?.id ?? null,
            authorName: m.from?.name ?? m.from?.username ?? null,
            authorHandle: m.from?.username ?? null,
            createdAt: m.created_time ?? new Date().toISOString(),
            outbound,
          }
        }),
      }
    })
  }

  /** Preporuke stranice; odgovor ide kao komentar na priču preporuke. */
  async pageRatings(pageId: string): Promise<InboxReview[]> {
    const res = await this.client().get<{
      data?: Array<{
        created_time?: string
        recommendation_type?: string
        review_text?: string
        rating?: number
        reviewer?: { id?: string; name?: string }
        open_graph_story?: { id?: string; comments?: { data?: FbComment[] } }
      }>
    }>(`${pageId}/ratings`, {
      fields:
        'created_time,recommendation_type,review_text,rating,reviewer{id,name},open_graph_story{id,comments{id,message,created_time,from{id,name}}}',
      limit: 25,
    })
    return (res.data ?? [])
      .filter((r) => r.open_graph_story?.id)
      .map((r) => ({
        id: r.open_graph_story!.id!,
        text: r.review_text ?? '',
        authorId: r.reviewer?.id ?? null,
        authorName: r.reviewer?.name ?? null,
        authorHandle: null,
        createdAt: r.created_time ?? new Date().toISOString(),
        rating: typeof r.rating === 'number' ? Math.min(5, Math.max(1, Math.round(r.rating))) : null,
        replies: (r.open_graph_story?.comments?.data ?? []).map(fbEntry),
      }))
  }

  /** Javni odgovor na komentar (Instagram `replies`, Facebook `comments`) ili na preporuku stranice. */
  async replyToComment(platform: 'instagram' | 'facebook', commentId: string, text: string): Promise<string> {
    const res = await this.client().post<{ id: string }>(
      platform === 'instagram' ? `${commentId}/replies` : `${commentId}/comments`,
      { message: text },
    )
    return res.id
  }

  /** Poruka kroz stranicu: odgovor u razgovoru (`id`) ili privatni odgovor na komentar (`comment_id`). */
  async sendMessage(
    pageId: string,
    recipient: { id: string } | { comment_id: string },
    text: string,
  ): Promise<string | null> {
    const res = await this.client().post<{ message_id?: string }>(`${pageId}/messages`, {
      recipient: JSON.stringify(recipient),
      message: JSON.stringify({ text }),
      messaging_type: 'RESPONSE',
    })
    return res.message_id ?? null
  }
}
