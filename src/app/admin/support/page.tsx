import type { Metadata } from 'next'

import { fmtDate, fmtN } from '@/components/admin/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAdmin } from '@/services/admin/context'
import { listSupportConversations } from '@/services/support/chat'

export const metadata: Metadata = { title: 'Podrška' }

/**
 * Razgovori sa chatbotom podrške (D-172): šta korisnici pitaju i šta im je Sova odgovorila, najnoviji
 * prvi. Poslato podršci znači da je razgovor postao prijava problema na tabli predloga.
 */
export default async function AdminSupportPage() {
  await requireAdmin()
  const conversations = await listSupportConversations(50)
  const escalated = conversations.filter((c) => c.escalated).length
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Podrška</h1>
        <p className="text-sm text-muted-foreground">
          Poslednjih {fmtN(conversations.length)} razgovora sa chatbotom u prozoru „Vodič i podrška”, od toga{' '}
          {fmtN(escalated)} poslato podršci. Poruke se brišu posle 90 dana.
        </p>
      </div>
      {conversations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Još niko nije pitao chatbota.</p>
      ) : (
        <div className="space-y-3">
          {conversations.map((c) => (
            <Card key={c.conversationId}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
                  <span>{c.userEmail ?? 'nepoznat korisnik'}</span>
                  {c.brandName ? <span className="text-muted-foreground">{c.brandName}</span> : null}
                  <span className="text-muted-foreground">
                    {fmtDate(c.startedAt)} · pitanja: {fmtN(c.questions)}
                  </span>
                  {c.escalated ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                      poslato podršci
                    </span>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <details>
                  <summary className="cursor-pointer text-sm">
                    {c.messages.find((m) => m.role === 'user')?.body.slice(0, 160) ?? 'razgovor'}
                  </summary>
                  <ol className="mt-3 space-y-2">
                    {c.messages.map((m) => (
                      <li key={m.id} className="text-sm">
                        <span className="font-medium">{m.role === 'user' ? 'Korisnik' : 'Sova'}</span>
                        <span className="text-muted-foreground"> · {fmtDate(m.createdAt)}</span>
                        {m.escalate ? (
                          <span className="text-amber-700"> · predlaže slanje podršci</span>
                        ) : null}
                        <p className="whitespace-pre-line">{m.body}</p>
                      </li>
                    ))}
                  </ol>
                </details>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
