import { assertViewer, createHandler } from '@/lib/api/handler'
import { removeMemberSchema, updateMemberSchema, uuidParamSchema } from '@/lib/schemas/workspace'
import { listInvitations, listMembers, removeMember, updateMember } from '@/services/team'

export const GET = createHandler({ auth: 'user', params: uuidParamSchema }, async ({ viewer, params }) => {
  const v = assertViewer(viewer)
  const members = await listMembers(v, params.id)
  let invitations: Awaited<ReturnType<typeof listInvitations>> = []
  try {
    invitations = await listInvitations(v, params.id)
  } catch {
    // editor/viewer ne vidi pozivnice; to nije greška
  }
  return { members, invitations }
})

export const PATCH = createHandler(
  { auth: 'user', params: uuidParamSchema, body: updateMemberSchema },
  async ({ viewer, params, body }) => {
    await updateMember(assertViewer(viewer), params.id, body)
    return { updated: true }
  },
)

export const DELETE = createHandler(
  { auth: 'user', params: uuidParamSchema, body: removeMemberSchema },
  async ({ viewer, params, body }) => {
    await removeMember(assertViewer(viewer), params.id, body.userId)
    return { removed: true }
  },
)
