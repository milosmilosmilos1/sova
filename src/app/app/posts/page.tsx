import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { PostsListClient } from '@/components/posts/posts-list-client'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'

export const metadata: Metadata = { title: 'Objave' }

export default async function PostsPage({ searchParams }: PageProps<'/app/posts'>) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/posts')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  const sp = await searchParams
  return (
    <PostsListClient
      brandId={brand.id}
      brandName={brand.name}
      canEdit={EDIT_ROLES.includes(current.role)}
      initialStatus={typeof sp.status === 'string' ? sp.status : ''}
    />
  )
}
