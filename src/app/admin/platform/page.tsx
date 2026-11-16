import type { Metadata } from 'next'

import {
  FlagToggle,
  MaintenanceForm,
  MediaCleanupButton,
  ModelsForm,
  TokenPricesForm,
} from '@/components/admin/admin-actions'
import { fmtDate, fmtN } from '@/components/admin/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MODEL_SLOTS, SLOT_KIND } from '@/lib/ai/models'
import { requireAdmin } from '@/services/admin/context'
import { getPlatform } from '@/services/admin/platform'
import { cleanupHistory } from '@/services/media-cleanup'

const mb = (bytes: number) => `${fmtN(Math.round(bytes / 104857.6) / 10)} MB`

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
  const [p, cleanups] = await Promise.all([getPlatform(), cleanupHistory()])
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
          <CardTitle className="text-base">Skladište</CardTitle>
          <CardDescription>
            Sova svake noći briše fajlove koje je sama napravila ili preuzela, kad više ne trebaju nijednoj
            objavi: kopije sa Unsplash-a i Pexels-a i video snimke 30 dana posle objave, fajlove obrisane
            objave 30 dana posle brisanja i stare verzije posle 7 dana. Galerija, logo, Figma šabloni,
            objavljeni slajdovi i gotov video ostaju.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <MediaCleanupButton />
          {cleanups.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Vreme</th>
                  <th className="py-1 pr-2 font-medium">Vrsta</th>
                  <th className="py-1 pr-2 text-right font-medium">Fajlova</th>
                  <th className="py-1 text-right font-medium">Oslobođeno</th>
                </tr>
              </thead>
              <tbody>
                {cleanups.map((r) => (
                  <tr key={`${r.at}-${r.mode}`} className="border-t">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{fmtDate(r.at)}</td>
                    <td className="py-1.5 pr-2">
                      {r.mode === 'daily' ? 'noćno' : 'ručno'}
                      {r.failed ? (
                        <span className="text-destructive"> · {fmtN(r.failed)} nije obrisano</span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmtN(r.files)}</td>
                    <td className="py-1.5 text-right tabular-nums">{mb(r.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">Čišćenje još nije pokrenuto.</p>
          )}
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
