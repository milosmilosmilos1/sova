'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ApiResponse } from '@/lib/api/response'

/**
 * Privatnost i podaci (brif 4, GDPR): izvoz podataka u JSON i brisanje naloga uz potvrdu emailom i
 * lozinkom. Nalozi bez lozinke (Google) potvrđuju svežom prijavom (15 minuta).
 */
export function PrivacyCard({
  email,
  hasPassword,
  disabledReason,
}: {
  email: string
  hasPassword: boolean
  disabledReason: string | null
}) {
  const [open, setOpen] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmEmail, ...(hasPassword ? { password } : {}) }),
      })
      const data = (await res.json()) as ApiResponse<{ redirect: string }>
      if (!data.ok) throw new Error(data.error.message)
      try {
        new BroadcastChannel('sova-auth').postMessage({ type: 'signed_out' })
      } catch {
        // stariji pregledač: ostali tabovi saznaju pri sledećem fokusu
      }
      window.location.href = data.data.redirect
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Brisanje nije uspelo.')
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Privatnost i podaci</CardTitle>
        <CardDescription>Preuzmite sve svoje podatke ili trajno obrišite nalog.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {disabledReason ? <p className="text-muted-foreground">{disabledReason}</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            nativeButton={false}
            disabled={Boolean(disabledReason)}
            render={<a href="/api/account/export" />}
          >
            Preuzmi moje podatke (JSON)
          </Button>
          <span className="text-xs text-muted-foreground">
            Profil, radni prostori čiji ste vlasnik, objave, mediji (linkovi važe 7 dana), tokeni i
            obaveštenja.
          </span>
        </div>
        {!open ? (
          <Button
            variant="ghost"
            className="text-destructive"
            disabled={Boolean(disabledReason)}
            onClick={() => setOpen(true)}
          >
            Obriši nalog…
          </Button>
        ) : (
          <div className="space-y-3 rounded-md border border-destructive/40 p-3">
            <p>
              Brisanje je trajno: brišu se nalog, radni prostori u kojima ste sami, njihove objave, mediji i
              veze sa mrežama. Ako ste vlasnik tima sa drugim članovima, prvo prenesite vlasništvo na strani
              Tim.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-email">Za potvrdu upišite email {email}</Label>
              <Input
                id="confirm-email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                autoComplete="off"
              />
            </div>
            {hasPassword ? (
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Lozinka</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nalog nema lozinku: brisanje je moguće u roku od 15 minuta posle prijave.
              </p>
            )}
            {error ? (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={
                  busy ||
                  confirmEmail.trim().toLowerCase() !== email.toLowerCase() ||
                  (hasPassword && !password)
                }
                onClick={() => void remove()}
              >
                {busy ? 'Brišem…' : 'Trajno obriši nalog'}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Odustani
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
