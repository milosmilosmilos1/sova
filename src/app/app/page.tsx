import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AUTOPILOT_LEVELS, type AutopilotLevel } from '@/lib/autopilot/rules'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { getCurrentWorkspace } from '@/lib/auth/workspace'
import { listBrands } from '@/services/brands'
import { getWorkspacePlan } from '@/services/plans'
import { countNewSuggestions } from '@/services/suggestions'

export default async function AppHomePage({ searchParams }: PageProps<'/app'>) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const sp = await searchParams

  const [brands, plan, balanceRes] = await Promise.all([
    listBrands(viewer, current.workspaceId),
    getWorkspacePlan(current.workspaceId),
    viewer.supabase.rpc('workspace_token_balance', { p_workspace_id: current.workspaceId }),
  ])
  const balance = (balanceRes.data as { total: number; reserved: number; available: number } | null) ?? null
  const currentBrand = await getCurrentBrand(viewer, current.workspaceId)
  const inboxCount = currentBrand ? await countNewSuggestions(viewer, currentBrand.id) : 0
  const level = (currentBrand?.autopilot_level ?? 0) as AutopilotLevel

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Dobro došli{viewer.profile.fullName ? `, ${viewer.profile.fullName.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground">
          Radni prostor <strong>{current.name}</strong> · plan {plan.name}
        </p>
        {sp.password === 'changed' ? (
          <p
            role="status"
            className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          >
            Lozinka je promenjena.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Tokeni</CardDescription>
            <CardTitle className="text-3xl">{balance ? balance.available : '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {balance ? `${balance.total} ukupno, ${balance.reserved} rezervisano` : 'Stanje nije dostupno.'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Brendovi</CardDescription>
            <CardTitle className="text-3xl">
              {brands.length} / {plan.limits.brands}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {brands.map((b) => b.name).join(', ') || 'Još nema brendova.'}
          </CardContent>
        </Card>
        {currentBrand ? (
          <Card>
            <CardHeader>
              <CardDescription>Inbox predloga · {currentBrand.name}</CardDescription>
              <CardTitle className="text-3xl">{inboxCount}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Autopilot: nivo {level} ({AUTOPILOT_LEVELS[level].label}).{' '}
                {inboxCount ? 'Novi predlozi čekaju odluku.' : 'Nema novih predloga.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/app/inbox" />}>
                  Otvori Inbox
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  nativeButton={false}
                  render={<Link href="/app/autopilot" />}
                >
                  Autopilot
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardDescription>Sledeći korak</CardDescription>
            <CardTitle className="text-lg">Analiza sajta (Brand Brain)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Sova čita sajt i izvlači logo, boje, usluge, ton i činjenice koje posle koristi u svakoj objavi.
            </p>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/app/brand" />}>
              Otvori Brand Brain
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
