import type { Metadata } from 'next'

import { FlagToggle, MaintenanceForm, ModelsForm, TokenPricesForm } from '@/components/admin/admin-actions'
import { fmtDate } from '@/components/admin/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MODEL_SLOTS, SLOT_KIND } from '@/lib/ai/models'
import { requireAdmin } from '@/services/admin/context'
import { getPlatform } from '@/services/admin/platform'

export const metadata: Metadata = { title: 'Platforma' }

const SLOT_LABEL: Record<string, string> = {
  text: 'Tekst',
  text_fallback: 'Tekst (rezervni)',
  image: 'Slika',
  image_premium: 'Slika (premium)',
  image_fallback: 'Slika (rezervna)',
  embedding: 'Embedding',
}

export default async function AdminPlatformPage() {
  await requireAdmin()
  const p = await getPlatform()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platforma</h1>
        <p className="text-sm text-muted-foreground">
          Feature flagovi, cene tokena, modeli i održavanje. Svaka izmena ide u audit log i važi za najviše
          minut.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Banner za održavanje</CardTitle>
        </CardHeader>
        <CardContent>
          <MaintenanceForm enabled={p.maintenance.enabled} message={p.maintenance.message} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feature flagovi</CardTitle>
          <CardDescription>Mreže (platform.*) i funkcije bez deploya.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody>
              {p.flags.map((f) => (
                <tr key={f.key} className="border-t first:border-t-0">
                  <td className="py-2 pr-2 font-mono text-xs">{f.key}</td>
                  <td className="py-2 pr-2 text-muted-foreground">{f.description ?? ''}</td>
                  <td className="py-2 pr-2 text-xs whitespace-nowrap text-muted-foreground">
                    {f.updatedByEmail ? `${f.updatedByEmail} · ` : ''}
                    {fmtDate(f.updatedAt)}
                  </td>
                  <td className="py-2 text-right">
                    <FlagToggle flagKey={f.key} enabled={f.enabled} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI modeli</CardTitle>
          <CardDescription>Izbor samo iz dozvoljene liste; prazno znači model iz env-a.</CardDescription>
        </CardHeader>
        <CardContent>
          <ModelsForm
            slots={MODEL_SLOTS.map((slot) => ({
              slot,
              label: SLOT_LABEL[slot] ?? slot,
              current: p.activeModels[slot],
              envDefault: p.envModels[slot],
              override: p.modelOverrides[slot] ?? null,
              options: p.allowedModels[SLOT_KIND[slot]],
            }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cene akcija u tokenima</CardTitle>
          <CardDescription>
            Važe za sva nova generisanja; već rezervisani tokeni se ne menjaju.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TokenPricesForm prices={p.tokenPrices} />
        </CardContent>
      </Card>
    </div>
  )
}
