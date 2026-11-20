import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { TemplateIcon } from '@/components/templates/template-icon'
import { getCurrentBrand } from '@/lib/auth/brand'
import { requireCompleteBrand } from '@/lib/auth/brand-ready'
import { getViewer } from '@/lib/auth/viewer'
import { getCurrentWorkspace } from '@/lib/auth/workspace'
import { TEMPLATE_GROUPS, TEMPLATE_IDS, TEMPLATES } from '@/lib/templates/catalog'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('templates')
  return { title: t('metaTitle') }
}

/** Šabloni koje biznis popunjava sam (D-175), po grupama. */
export default async function TemplatesPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/templates')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  await requireCompleteBrand(brand.id)
  const t = await getTranslations('templates')
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <span className="rounded-full border px-2 py-0.5 text-xs font-medium">{t('free')}</span>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      {TEMPLATE_GROUPS.map((group) => (
        <section key={group} aria-labelledby={`templates-${group}`} className="space-y-3">
          <h2 id={`templates-${group}`} className="text-sm font-semibold text-muted-foreground">
            {t(`groups.${group}`)}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {TEMPLATE_IDS.filter((id) => TEMPLATES[id].group === group).map((id) => (
              <li key={id}>
                <Link
                  href={`/app/templates/${id}`}
                  className="flex h-full items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <TemplateIcon id={id} />
                  <span className="min-w-0 space-y-0.5">
                    <span className="block font-medium">{t(`items.${id}.name`)}</span>
                    <span className="block text-sm text-muted-foreground">
                      {t(`items.${id}.description`)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
