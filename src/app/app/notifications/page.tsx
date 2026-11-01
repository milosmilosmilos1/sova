import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { NotificationsList } from '@/components/app/notifications-list'
import { getViewer } from '@/lib/auth/viewer'
import { getCurrentWorkspace } from '@/lib/auth/workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notifications')
  return { title: t('metaTitle') }
}

export default async function NotificationsPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/notifications')
  const current = await getCurrentWorkspace(viewer)
  const t = await getTranslations('notifications')
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">
            {current ? t('introFor', { workspace: current.name }) : t('intro')}
          </p>
        </div>
        <Link href="/app/settings#obavestenja" className="text-sm underline">
          {t('settingsLink')}
        </Link>
      </div>
      <NotificationsList workspaceId={current?.workspaceId ?? null} />
    </div>
  )
}
