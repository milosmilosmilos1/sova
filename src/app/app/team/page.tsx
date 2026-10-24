import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AutoSubmitSelect } from '@/components/app/auto-submit-select'
import { InviteForm } from '@/components/app/team-forms'
import { TransferOwnershipForm } from '@/components/app/transfer-ownership-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { removeMemberAction, revokeInvitationAction, updateMemberAction } from '@/lib/auth/actions'
import { getViewer } from '@/lib/auth/viewer'
import { ADMIN_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'
import { listBrands } from '@/services/brands'
import { getWorkspacePlan } from '@/services/plans'
import { listInvitations, listMembers, type PendingInvitation } from '@/services/team'

export const metadata: Metadata = { title: 'Tim' }

const ROLE_LABEL: Record<string, string> = {
  owner: 'Vlasnik',
  admin: 'Administrator',
  editor: 'Urednik',
  approver: 'Odobravalac',
  viewer: 'Posmatrač',
}

const ASSIGNABLE = ['admin', 'editor', 'approver', 'viewer'] as const

export default async function TeamPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const isAdmin = ADMIN_ROLES.includes(current.role)

  const [members, brands, plan] = await Promise.all([
    listMembers(viewer, current.workspaceId),
    listBrands(viewer, current.workspaceId),
    getWorkspacePlan(current.workspaceId),
  ])
  let invitations: PendingInvitation[] = []
  if (isAdmin) invitations = await listInvitations(viewer, current.workspaceId)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tim</h1>
        <p className="text-sm text-muted-foreground">
          {members.length} {members.length === 1 ? 'član' : 'članova'} od {plan.limits.members} dozvoljenih na
          planu {plan.name}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Članovi</CardTitle>
          <CardDescription>
            Vlasnik ima sve, administrator sve osim naplate, urednik kreira, odobravalac odobrava, posmatrač
            gleda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Osoba</TableHead>
                <TableHead>Uloga</TableHead>
                <TableHead>Brendovi</TableHead>
                <TableHead className="text-right">Radnje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const isSelf = m.userId === viewer.user.id
                const canEdit = isAdmin && m.role !== 'owner' && !isSelf
                return (
                  <TableRow key={m.userId}>
                    <TableCell>
                      <div className="font-medium">{m.fullName ?? m.email}</div>
                      <div className="text-xs text-muted-foreground">{m.email}</div>
                    </TableCell>
                    <TableCell>
                      {canEdit ? (
                        <form action={updateMemberAction} className="max-w-44">
                          <input type="hidden" name="workspaceId" value={current.workspaceId} />
                          <input type="hidden" name="userId" value={m.userId} />
                          <AutoSubmitSelect
                            name="role"
                            value={m.role}
                            ariaLabel={`Uloga za ${m.email}`}
                            options={ASSIGNABLE.map((r) => ({ value: r, label: ROLE_LABEL[r]! }))}
                          />
                        </form>
                      ) : (
                        <Badge variant="secondary">{ROLE_LABEL[m.role]}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {m.allBrands
                        ? 'svi'
                        : m.brandIds.map((id) => brands.find((b) => b.id === id)?.name ?? '?').join(', ') ||
                          'nijedan'}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit || (isSelf && m.role !== 'owner') ? (
                        <form action={removeMemberAction}>
                          <input type="hidden" name="workspaceId" value={current.workspaceId} />
                          <input type="hidden" name="userId" value={m.userId} />
                          <Button type="submit" variant="ghost" size="sm">
                            {isSelf ? 'Napustite' : 'Ukloni'}
                          </Button>
                        </form>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {current.role === 'owner' ? (
        <Card>
          <CardHeader>
            <CardTitle>Prenos vlasništva</CardTitle>
            <CardDescription>
              Vlasnik upravlja naplatom i može da obriše radni prostor. Posle prenosa ostajete administrator.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TransferOwnershipForm
              workspaceId={current.workspaceId}
              members={members
                .filter((m) => m.userId !== viewer.user.id)
                .map((m) => ({
                  userId: m.userId,
                  label: `${m.fullName ?? m.email} (${ROLE_LABEL[m.role]})`,
                }))}
            />
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Pozovite člana</CardTitle>
              <CardDescription>Pozivnica stiže emailom i važi 7 dana.</CardDescription>
            </CardHeader>
            <CardContent>
              <InviteForm workspaceId={current.workspaceId} brands={brands} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Pozivnice na čekanju</CardTitle>
            </CardHeader>
            <CardContent>
              {invitations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nema pozivnica na čekanju.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {invitations.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-3 py-2">
                      <div>
                        <div className="font-medium">{inv.email}</div>
                        <div className="text-xs text-muted-foreground">
                          {ROLE_LABEL[inv.role]} · ističe{' '}
                          {new Date(inv.expiresAt).toLocaleDateString('sr-Latn-RS')}
                        </div>
                      </div>
                      <form action={revokeInvitationAction}>
                        <input type="hidden" name="workspaceId" value={current.workspaceId} />
                        <input type="hidden" name="invitationId" value={inv.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Opozovi
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
