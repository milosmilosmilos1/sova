import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { TemplateEditor } from '@/components/templates/template-editor'
import { toContentLocale } from '@/config/locales'
import { getCurrentBrand } from '@/lib/auth/brand'
import { requireCompleteBrand } from '@/lib/auth/brand-ready'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'
import { isTemplateId } from '@/lib/templates/catalog'
import { listSocialAccounts } from '@/services/social/accounts'

export async function generateMetadata({ params }: PageProps<'/app/templates/[id]'>): Promise<Metadata> {
  const { id } = await params
  const t = await getTranslations('templates')
  return { title: isTemplateId(id) ? t(`items.${id}.name`) : t('metaTitle') }
}

/** Jedan šablon (D-175): polja, pregled u stilu brenda i nacrt koji se zakazuje u editoru. */
export default async function TemplatePage({ params }: PageProps<'/app/templates/[id]'>) {
  const { id } = await params
  if (!isTemplateId(id)) notFound()
  const viewer = await getViewer()
  if (!viewer) redirect(`/login?next=/app/templates/${id}`)
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  await requireCompleteBrand(brand.id)
  const { accounts } = await listSocialAccounts(viewer, brand.id)
  return (
    <TemplateEditor
      key={`${brand.id}-${id}`}
      templateId={id}
      brandId={brand.id}
      canEdit={EDIT_ROLES.includes(current.role)}
      accounts={accounts
        .filter((a) => a.status === 'active')
        .map((a) => ({ id: a.id, platform: a.platform, name: a.name, username: a.username }))}
      contentLocale={toContentLocale(brand.content_locale)}
    />
  )
}
