'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, Mail, RotateCcw, Send, Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import { api } from '@/components/shared/api-client'
import { cn } from '@/lib/utils'

interface SupportMessage {
  id: string
  role: 'user' | 'assistant'
  body: string
  escalate: boolean
  escalated: boolean
  createdAt: string
}

interface SupportThread {
  conversationId: string | null
  messages: SupportMessage[]
  ideaId: string | null
}

/** Najduže pitanje, isto kao u šemi na serveru. */
const QUESTION_MAX = 1000

/**
 * Chatbot podrške (D-172) u prozoru „Vodič i podrška”: pitanje o Sovi, odgovor odmah, a kad odgovor
 * ne pomaže ili chatbot ne radi, razgovor ide podršci kao prijava problema.
 */
export function SupportChat({ brandId, supportEmail }: { brandId: string; supportEmail: string }) {
  const t = useTranslations('guide.chat')
  // razgovor se čita pri svakom otvaranju: stanje razgovora živi u komponenti dok je prozor otvoren
  const thread = useQuery({
    queryKey: ['support-thread'],
    queryFn: () => api<SupportThread>('/api/support/chat'),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
  if (thread.isPending)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t('loading')}
      </p>
    )
  return (
    <ChatBody
      brandId={brandId}
      supportEmail={supportEmail}
      initial={thread.data ?? { conversationId: null, messages: [], ideaId: null }}
    />
  )
}

function ChatBody({
  brandId,
  supportEmail,
  initial,
}: {
  brandId: string
  supportEmail: string
  initial: SupportThread
}) {
  const t = useTranslations('guide.chat')
  const [conversationId, setConversationId] = useState<string | null>(initial.conversationId)
  const [messages, setMessages] = useState<SupportMessage[]>(initial.messages)
  const [ideaId, setIdeaId] = useState<string | null>(initial.ideaId)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLLIElement | null>(null)

  const send = useMutation({
    mutationFn: (input: { conversationId: string; text: string }) =>
      api<{ conversationId: string; messages: SupportMessage[] }>('/api/support/chat', {
        method: 'POST',
        json: { brandId, conversationId: input.conversationId, text: input.text },
      }),
    onSuccess: (r) => {
      // pitanje prikazano dok se čekalo zamenjuju pitanje i odgovor sa servera
      setMessages((list) => [...list.filter((m) => m.id !== 'pending'), ...r.messages])
      setError(null)
    },
    onError: (e) => {
      // pitanje je sačuvano i bez odgovora, pa ostaje u razgovoru i može da se pošalje podršci
      setMessages((list) =>
        list.map((m) => (m.id === 'pending' ? { ...m, id: `unanswered-${m.createdAt}` } : m)),
      )
      setError(e.message || t('error'))
    },
  })

  const escalate = useMutation({
    mutationFn: (id: string) =>
      api<{ ideaId: string }>('/api/support/chat/escalate', { method: 'POST', json: { conversationId: id } }),
    onSuccess: (r) => {
      setIdeaId(r.ideaId)
      setError(null)
      setMessages((list) => [
        ...list,
        {
          id: `escalated-${r.ideaId}`,
          role: 'assistant',
          body: '',
          escalate: false,
          escalated: true,
          createdAt: new Date().toISOString(),
        },
      ])
    },
    onError: (e) => setError(e.message || t('error')),
  })

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length, send.isPending])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const question = text.trim()
    if (!question || send.isPending) return
    const id = conversationId ?? crypto.randomUUID()
    setConversationId(id)
    setText('')
    setError(null)
    setMessages((list) => [
      ...list,
      {
        id: 'pending',
        role: 'user',
        body: question,
        escalate: false,
        escalated: false,
        createdAt: new Date().toISOString(),
      },
    ])
    send.mutate({ conversationId: id, text: question })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  const restart = () => {
    setConversationId(null)
    setMessages([])
    setIdeaId(null)
    setError(null)
  }

  const asked = messages.some((m) => m.role === 'user')
  const last = [...messages].reverse().find((m) => m.role === 'assistant')
  const suggest = Boolean(error) || Boolean(last?.escalate)
  const canEscalate = Boolean(conversationId) && asked && !ideaId && !send.isPending

  return (
    <div className="space-y-3">
      {messages.length === 0 ? <p className="text-sm text-muted-foreground">{t('intro')}</p> : null}
      {messages.length > 0 ? (
        <ol
          aria-live="polite"
          aria-label={t('history')}
          className="max-h-[45vh] space-y-2 overflow-y-auto pr-1"
        >
          {messages.map((m) => (
            <li key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line',
                  m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                  m.escalated && 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
                )}
              >
                <span className="sr-only">{m.role === 'user' ? t('you') : t('bot')}: </span>
                {m.escalated ? t('escalated') : m.body}
              </div>
            </li>
          ))}
          {send.isPending ? (
            <li className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t('thinking')}
            </li>
          ) : null}
          <li ref={end} aria-hidden className="h-0" />
        </ol>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900"
        >
          <p>{error}</p>
          <a href={`mailto:${supportEmail}`} className="inline-flex items-center gap-1 font-medium underline">
            <Mail className="size-3.5" aria-hidden />
            {supportEmail}
          </a>
        </div>
      ) : null}

      {canEscalate ? (
        <button
          type="button"
          onClick={() => conversationId && escalate.mutate(conversationId)}
          disabled={escalate.isPending}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60',
            suggest ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border hover:bg-muted',
          )}
        >
          {escalate.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Share2 className="size-4" aria-hidden />
          )}
          {t('escalate')}
        </button>
      ) : null}

      <form onSubmit={submit} className="space-y-2">
        <label htmlFor="support-question" className="sr-only">
          {t('label')}
        </label>
        <textarea
          id="support-question"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, QUESTION_MAX))}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={QUESTION_MAX}
          placeholder={t('placeholder')}
          className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
        <div className="flex items-center justify-between gap-2">
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={restart}
              disabled={send.isPending}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              {t('newChat')}
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={!text.trim() || send.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Send className="size-4" aria-hidden />
            {t('send')}
          </button>
        </div>
      </form>
      <p className="text-xs text-muted-foreground">{t('disclaimer')}</p>
    </div>
  )
}
