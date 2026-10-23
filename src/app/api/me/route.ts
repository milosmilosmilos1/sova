import { assertViewer, createHandler } from '@/lib/api/handler'
import { listMemberships } from '@/lib/auth/workspace'

export const GET = createHandler({ auth: 'user' }, async ({ viewer }) => {
  const v = assertViewer(viewer)
  const memberships = await listMemberships(v)
  return { user: v.user, profile: v.profile, mfaVerified: v.mfaVerified, memberships }
})
