import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'

import { AutoSubmitSelect } from '@/components/app/auto-submit-select'
import { InviteForm } from '@/components/app/team-forms'
import { TransferOwnershipForm } from '@/components/app/transfer-ownership-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { INTL_UI } from '@/i18n/config'
import { removeMemberAction, revokeInvitationAction, updateMemberAction } from '@/lib/auth/actions'
import { getViewer } from '@/lib/auth/viewer'
import { ADMIN_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'
import { listBrands } from '@/services/brands'
import { getWorkspacePlan } from '@/services/plans'
import { listInvitations, listMembers, type PendingInvitation } from '@/services/team'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('team')
  return { title: t('metaTitle') }
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
  const [t, tb, locale] = await Promise.all([
    getTranslations('team'),
    getTranslations('billing'),
    getLocale(),
  ])
  // naziv plana iz baze se prevodi po kodu; nepoznat kod ostaje sa nazivom iz baze
  const planKey = `planNames.${plan.code}` as 'planNames.free'
  const planName = tb.has(planKey) ? tb(planKey) : plan.name

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('summary', { count: members.length, limit: plan.limits.members, plan: planName })}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('members.title')}</CardTitle>
          <CardDescription>{t('members.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('members.person')}</TableHead>
                <TableHead>{t('members.role')}</TableHead>
                <TableHead>{t('members.brands')}</TableHead>
                <TableHead className="text-right">{t('members.actions')}</TableHead>
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
                            ariaLabel={t('members.roleFor', { email: m.email })}
                            options={ASSIGNABLE.map((r) => ({ value: r, label: t(`roles.${r}`) }))}
                          />
                        </form>
                      ) : (
                        <Badge variant="secondary">{t(`roles.${m.role}`)}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {m.allBrands
                        ? t('members.allBrands')
                        : m.brandIds.map((id) => brands.find((b) => b.id === id)?.name ?? '?').join(', ') ||
                          t('members.noBrands')}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit || (isSelf && m.role !== 'owner') ? (
                        <form action={removeMemberAction}>
                          <input type="hidden" name="workspaceId" value={current.workspaceId} />
                          <input type="hidden" name="userId" value={m.userId} />
                          <Button type="submit" variant="ghost" size="sm">
                            {isSelf ? t('members.leave') : t('members.remove')}
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
            <CardTitle>{t('transfer.title')}</CardTitle>
            <CardDescription>{t('transfer.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <TransferOwnershipForm
              workspaceId={current.workspaceId}
              members={members
                .filter((m) => m.userId !== viewer.user.id)
                .map((m) => ({
                  userId: m.userId,
                  label: `${m.fullName ?? m.email} (${t(`roles.${m.role}`)})`,
                }))}
            />
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('invite.title')}</CardTitle>
              <CardDescription>{t('invite.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <InviteForm workspaceId={current.workspaceId} brands={brands} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('invitations.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              {invitations.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('invitations.empty')}</p>
              ) : (
                <ul className="divide-y text-sm">
                  {invitations.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-3 py-2">
                      <div>
                        <div className="font-medium">{inv.email}</div>
                        <div className="text-xs text-muted-foreground">
                          {t('invitations.expires', {
                            role: t(`roles.${inv.role}`),
                            date: new Date(inv.expiresAt).toLocaleDateString(INTL_UI[locale]),
                          })}
                        </div>
                      </div>
                      <form action={revokeInvitationAction}>
                        <input type="hidden" name="workspaceId" value={current.workspaceId} />
                        <input type="hidden" name="invitationId" value={inv.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          {t('invitations.revoke')}
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
