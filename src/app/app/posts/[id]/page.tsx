import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { PostEditor } from '@/components/posts/post-editor'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { getCurrentWorkspace } from '@/lib/auth/workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell')
  return { title: t('titles.post') }
}

export default async function PostPage({ params }: PageProps<'/app/posts/[id]'>) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/posts')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  const { id } = await params
  return (
    <PostEditor
      brandId={brand.id}
      brandName={brand.name}
      timezone={brand.timezone}
      postId={id}
      role={current.role}
    />
  )
}
