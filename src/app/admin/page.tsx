import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export default async function AdminHomePage() {
  const admin = createSupabaseAdminClient()
  const [users, workspaces, brands] = await Promise.all([
    admin.from('profiles').select('id', { count: 'exact', head: true }),
    admin.from('workspaces').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    admin.from('brands').select('id', { count: 'exact', head: true }).is('deleted_at', null),
  ])
  const stats = [
    { label: 'Korisnici', value: users.count ?? 0 },
    { label: 'Radni prostori', value: workspaces.count ?? 0 },
    { label: 'Brendovi', value: brands.count ?? 0 },
  ]
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pregled</h1>
        <p className="text-sm text-muted-foreground">
          Pun admin panel (statistike, korisnici, tokeni, impersonacija, audit) stiže u fazi 13.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </div>
    </div>
  )
}
