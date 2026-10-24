import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { PostEditor } from '@/components/posts/post-editor'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'

export const metadata: Metadata = { title: 'Nova objava' }

export default async function NewPostPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login?next=/app/posts/new')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const brand = await getCurrentBrand(viewer, current.workspaceId)
  if (!brand) redirect('/app/settings')
  if (!EDIT_ROLES.includes(current.role)) redirect('/app/posts')
  return (
    <PostEditor
      brandId={brand.id}
      brandName={brand.name}
      timezone={brand.timezone}
      postId={null}
      role={current.role}
    />
  )
}
