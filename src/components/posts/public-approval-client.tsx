'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { ApiResponse } from '@/lib/api/response'

interface PublicPost {
  id: string
  version: number
  status: string
  title: string | null
  text: string
  firstComment: string | null
  linkUrl: string | null
  scheduledFor: string | null
  platforms: string[]
  media: Array<{ url: string; alt: string | null }>
  comments: Array<{ id: string; author: string; body: string; createdAt: string }>
  decided: { decision: string; comment: string | null; at: string } | null
}
interface View {
  brandName: string
  clientLabel: string | null
  expiresAt: string
  posts: PublicPost[]
}

async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.json !== undefined) headers.set('content-type', 'application/json')
  const res = await fetch(path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })
  const data = (await res.json()) as ApiResponse<T>
  if (!data.ok) throw new Error(data.error.message)
  return data.data
}

const STATUS: Record<string, string> = {
  in_review: 'čeka vašu odluku',
  approved: 'odobreno',
  rejected: 'odbijeno',
  draft: 'vraćeno na doradu',
  scheduled: 'zakazano',
  published: 'objavljeno',
}

export function PublicApprovalClient({ token }: { token: string }) {
  const qc = useQueryClient()
  const view = useQuery({
    queryKey: ['public-approval', token],
    queryFn: () => api<View>(`/api/public/approvals/${token}`),
    retry: false,
  })
  const [name, setName] = useState('')
  const [comments, setComments] = useState<Record<string, string>>({})
  const decide = useMutation({
    mutationFn: (input: { postId: string; postVersion: number; decision: string }) =>
      api(`/api/public/approvals/${token}`, {
        method: 'POST',
        json: {
          kind: 'decision',
          ...input,
          comment: comments[input.postId] || undefined,
          name: name || undefined,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-approval', token] }),
  })
  const comment = useMutation({
    mutationFn: (postId: string) =>
      api(`/api/public/approvals/${token}`, {
        method: 'POST',
        json: { kind: 'comment', postId, body: comments[postId], name: name || undefined },
      }),
    onSuccess: (_d, postId) => {
      setComments((c) => ({ ...c, [postId]: '' }))
      void qc.invalidateQueries({ queryKey: ['public-approval', token] })
    },
  })

  if (view.isPending)
    return <p className="mx-auto max-w-2xl p-6 text-sm text-muted-foreground">Učitavam objave…</p>
  if (view.isError)
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold">Link nije dostupan</h1>
        <p className="mt-2 text-sm text-muted-foreground">{view.error.message}</p>
      </div>
    )
  const v = view.data
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Objave za odobrenje · {v.brandName}</h1>
        <p className="text-sm text-muted-foreground">
          {v.clientLabel ? `Za: ${v.clientLabel}. ` : ''}Link važi do{' '}
          {new Date(v.expiresAt).toLocaleString('sr-Latn-RS')}. Vaše odluke stižu timu odmah.
        </p>
        <div className="mt-3 max-w-xs">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vaše ime (opciono)" />
        </div>
      </div>
      {v.posts.map((p) => (
        <Card key={p.id}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {p.title ?? 'Objava'}
              <Badge variant={p.status === 'in_review' ? 'default' : 'secondary'}>
                {STATUS[p.status] ?? p.status}
              </Badge>
              {p.platforms.map((pl) => (
                <Badge key={pl} variant="outline">
                  {pl}
                </Badge>
              ))}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {p.media.length ? (
              <div className="grid grid-cols-2 gap-2">
                {p.media.map((m, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={m.url}
                    alt={m.alt ?? ''}
                    className="w-full rounded-md border object-cover"
                  />
                ))}
              </div>
            ) : null}
            <p className="whitespace-pre-wrap">{p.text}</p>
            {p.firstComment ? <p className="text-muted-foreground">Prvi komentar: {p.firstComment}</p> : null}
            {p.linkUrl ? <p className="text-muted-foreground">Link: {p.linkUrl}</p> : null}
            {p.scheduledFor ? (
              <p className="text-muted-foreground">
                Planirano: {new Date(p.scheduledFor).toLocaleString('sr-Latn-RS')}
              </p>
            ) : null}
            {p.decided ? (
              <p className="rounded-md bg-muted p-2">
                Odluka: {STATUS[p.decided.decision] ?? p.decided.decision} ·{' '}
                {new Date(p.decided.at).toLocaleString('sr-Latn-RS')}
                {p.decided.comment ? ` · „${p.decided.comment}”` : ''}
              </p>
            ) : null}
            {p.comments.length ? (
              <div className="space-y-1">
                {p.comments.map((c) => (
                  <p key={c.id} className="rounded-md bg-muted p-2">
                    <span className="text-xs text-muted-foreground">
                      {c.author} · {new Date(c.createdAt).toLocaleString('sr-Latn-RS')}
                    </span>
                    <br />
                    {c.body}
                  </p>
                ))}
              </div>
            ) : null}
            <Textarea
              value={comments[p.id] ?? ''}
              onChange={(e) => setComments((c) => ({ ...c, [p.id]: e.target.value }))}
              rows={2}
              placeholder="Komentar (obavezan za odbijanje ili izmene)"
            />
            <div className="flex flex-wrap gap-2">
              {p.status === 'in_review' ? (
                <>
                  <Button
                    onClick={() =>
                      decide.mutate({ postId: p.id, postVersion: p.version, decision: 'approved' })
                    }
                    disabled={decide.isPending}
                  >
                    Odobri
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      decide.mutate({ postId: p.id, postVersion: p.version, decision: 'changes_requested' })
                    }
                    disabled={decide.isPending || !comments[p.id]?.trim()}
                  >
                    Traži izmene
                  </Button>
                  <Button
                    variant="outline"
                    className="text-destructive"
                    onClick={() =>
                      decide.mutate({ postId: p.id, postVersion: p.version, decision: 'rejected' })
                    }
                    disabled={decide.isPending || !comments[p.id]?.trim()}
                  >
                    Odbij
                  </Button>
                </>
              ) : null}
              <Button
                variant="ghost"
                onClick={() => comment.mutate(p.id)}
                disabled={comment.isPending || !comments[p.id]?.trim()}
              >
                Pošalji komentar
              </Button>
            </div>
            {decide.error || comment.error ? (
              <p role="alert" className="text-destructive">
                {(decide.error ?? comment.error)?.message}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
