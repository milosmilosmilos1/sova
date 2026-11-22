import 'server-only'

import { render } from '@react-email/render'
import type { ReactElement } from 'react'
import { Resend } from 'resend'

import { configured, env, isPreview, isProd } from '@/lib/env'
import { logger } from '@/lib/logger'

export interface SendEmailInput {
  to: string | string[]
  subject: string
  react: ReactElement
  replyTo?: string
  tags?: Record<string, string>
  /** prilozi (mesečni PDF izveštaj, D-094) */
  attachments?: Array<{ filename: string; content: Buffer }>
}

let resendSingleton: Resend | null = null

function getResend(): Resend | null {
  if (!configured.resend) return null
  resendSingleton ??= new Resend(env.RESEND_API_KEY)
  return resendSingleton
}

/** Mailpit lokalnog Supabase-a: zadat adresom ili podrazumevan kad je Supabase lokalni (DEV, E2E). */
function mailpitUrl(): string | null {
  if (isProd && !isPreview) return null
  if (env.MAILPIT_URL) return env.MAILPIT_URL
  const supabase = env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(supabase) ? 'http://127.0.0.1:54324' : null
}

/** Pošalje mejl u Mailpit preko njegovog API-ja; neuspeh samo beleži (Mailpit možda ne radi). */
async function sendToMailpit(base: string, input: SendEmailInput, html: string): Promise<string | null> {
  const from = /^(.*?)\s*<([^>]+)>$/.exec(env.EMAIL_FROM)
  try {
    const res = await fetch(`${base}/api/v1/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        From: from ? { Name: from[1], Email: from[2] } : { Email: env.EMAIL_FROM },
        To: (Array.isArray(input.to) ? input.to : [input.to]).map((Email) => ({ Email })),
        Subject: input.subject,
        HTML: html,
        Text: await render(input.react, { plainText: true }),
      }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`Mailpit ${res.status}`)
    return ((await res.json()) as { ID?: string }).ID ?? null
  } catch (error) {
    logger.warn('email_mailpit_failed', { error: error instanceof Error ? error.message : String(error) })
    return null
  }
}

/**
 * Transakcioni email. Sa Resend ključem šalje; bez njega (DEV ili režim pregleda, D-101) loguje
 * naslov i linkove iz poruke da se tok može ručno proveriti, a uz lokalni Supabase ga stavlja i u
 * Mailpit (D-187), gde ga E2E testovi čitaju.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ id: string | null }> {
  const resend = getResend()
  if (!resend) {
    if (isProd && !isPreview) throw new Error('RESEND_API_KEY nije podešen.')
    const html = await render(input.react)
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((l) => l?.startsWith('http'))
    logger.info('email_dev_log', {
      to: input.to,
      subject: input.subject,
      links,
      attachments: input.attachments?.map((a) => ({ filename: a.filename, bytes: a.content.length })),
    })
    const mailpit = mailpitUrl()
    return { id: mailpit ? await sendToMailpit(mailpit, input, html) : null }
  }
  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    react: input.react,
    replyTo: input.replyTo,
    attachments: input.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
    tags: input.tags ? Object.entries(input.tags).map(([name, value]) => ({ name, value })) : undefined,
  })
  if (error) {
    logger.error('email_send_failed', { subject: input.subject, error })
    throw new Error(`Slanje emaila nije uspelo: ${error.message}`)
  }
  return { id: data?.id ?? null }
}
