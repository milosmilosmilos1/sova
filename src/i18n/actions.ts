'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

import { getViewer } from '@/lib/auth/viewer'
import { logger } from '@/lib/logger'

import { isAppLocale, LOCALE_COOKIE } from './config'

/**
 * Jezik interfejsa (D-108): kolačić važi za ceo pregledač, a prijavljenom korisniku se upisuje i
 * u profil (mejlovi i sledeća prijava). Tokom impersonacije se menja samo kolačić admina.
 */
export async function changeLocaleAction(locale: string): Promise<{ ok: boolean }> {
  if (!isAppLocale(locale)) return { ok: false }
  const store = await cookies()
  store.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  const viewer = await getViewer()
  if (viewer && !viewer.impersonation) {
    const { error } = await viewer.supabase.from('profiles').update({ locale }).eq('id', viewer.user.id)
    if (error) logger.warn('profile_locale_update_failed', { error: error.message })
  }
  revalidatePath('/', 'layout')
  return { ok: true }
}
