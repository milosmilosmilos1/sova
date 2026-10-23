import 'server-only'

import { render } from '@react-email/render'
import type { ReactElement } from 'react'
import { Resend } from 'resend'

import { configured, env, isProd } from '@/lib/env'
import { logger } from '@/lib/logger'

export interface SendEmailInput {
  to: string | string[]
  subject: string
  react: ReactElement
  replyTo?: string
  tags?: Record<string, string>
}

let resendSingleton: Resend | null = null

function getResend(): Resend | null {
  if (!configured.resend) return null
  resendSingleton ??= new Resend(env.RESEND_API_KEY)
  return resendSingleton
}

/**
 * Transakcioni email. Sa Resend ključem šalje; bez njega (DEV) loguje
 * naslov i linkove iz poruke da se tok može ručno proveriti.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ id: string | null }> {
  const resend = getResend()
  if (!resend) {
    if (isProd) throw new Error('RESEND_API_KEY nije podešen.')
    const html = await render(input.react)
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((l) => l?.startsWith('http'))
    logger.info('email_dev_log', { to: input.to, subject: input.subject, links })
    return { id: null }
  }
  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    react: input.react,
    replyTo: input.replyTo,
    tags: input.tags ? Object.entries(input.tags).map(([name, value]) => ({ name, value })) : undefined,
  })
  if (error) {
    logger.error('email_send_failed', { subject: input.subject, error })
    throw new Error(`Slanje emaila nije uspelo: ${error.message}`)
  }
  return { id: data?.id ?? null }
}
