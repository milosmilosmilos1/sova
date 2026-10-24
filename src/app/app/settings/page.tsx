import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { CanvaCard } from '@/components/app/canva-card'
import { NotificationPrefsCard } from '@/components/app/notification-prefs-card'
import { CreateBrandForm, ProfileForm, WorkspaceForm } from '@/components/app/settings-forms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { deleteBrandAction } from '@/lib/auth/actions'
import { getViewer } from '@/lib/auth/viewer'
import { ADMIN_ROLES, EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'
import { listBrands } from '@/services/brands'
import { getWorkspacePlan } from '@/services/plans'
import { countScheduledPosts } from '@/services/posts/publisher'

export const metadata: Metadata = { title: 'Podešavanja' }

export default async function SettingsPage({ searchParams }: PageProps<'/app/settings'>) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const sp = await searchParams
  const canvaNotice = typeof sp.canva === 'string' ? sp.canva : null
  const [brands, plan] = await Promise.all([
    listBrands(viewer, current.workspaceId),
    getWorkspacePlan(current.workspaceId),
  ])
  const scheduledCounts = await countScheduledPosts(
    viewer,
    brands.map((b) => b.id),
  )
  const isAdmin = ADMIN_ROLES.includes(current.role)
  const canEdit = EDIT_ROLES.includes(current.role)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Podešavanja</h1>
        <p className="text-sm text-muted-foreground">Profil, radni prostor i brendovi.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vaš profil</CardTitle>
          <CardDescription>{viewer.user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            fullName={viewer.profile.fullName ?? ''}
            locale={viewer.profile.locale}
            timezone={viewer.profile.timezone}
          />
          <p className="mt-4 text-sm text-muted-foreground">
            Dvofaktorska zaštita i lozinka:{' '}
            <Link href="/app/settings/security" className="underline">
              Bezbednost
            </Link>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Radni prostor</CardTitle>
          <CardDescription>
            Plan <Badge variant="secondary">{plan.name}</Badge> · do {plan.limits.brands} brenda,{' '}
            {plan.limits.social_accounts} mreža, {plan.limits.members} člana.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isAdmin ? (
            <WorkspaceForm workspaceId={current.workspaceId} name={current.name} type={current.type} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {current.name} · {current.type === 'agency' ? 'agencija' : 'biznis'}. Samo vlasnik i
              administrator menjaju podešavanja.
            </p>
          )}
        </CardContent>
      </Card>

      <NotificationPrefsCard workspaceId={current.workspaceId} />

      <Card>
        <CardHeader>
          <CardTitle>Brendovi</CardTitle>
          <CardDescription>Svaki brend ima svoj Brand Brain, mreže i kalendar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ul className="divide-y">
            {brands.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {b.website_url ?? 'bez sajta'} · {b.content_locale} · {b.timezone}
                    {scheduledCounts[b.id]
                      ? ` · ${scheduledCounts[b.id]} zakazanih objava (arhiviranje ih otkazuje)`
                      : ''}
                  </div>
                </div>
                {isAdmin && brands.length > 1 ? (
                  <form action={deleteBrandAction}>
                    <input type="hidden" name="brandId" value={b.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Arhiviraj
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
          {canEdit ? (
            brands.length < plan.limits.brands ? (
              <CreateBrandForm workspaceId={current.workspaceId} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Dostigli ste limit brendova za plan {plan.name}. Nadogradnja stiže sa naplatom.
              </p>
            )
          ) : null}
        </CardContent>
      </Card>

      <CanvaCard workspaceId={current.workspaceId} canEdit={canEdit} notice={canvaNotice} />
    </div>
  )
}
