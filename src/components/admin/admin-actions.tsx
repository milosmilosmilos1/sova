'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { ApiResponse } from '@/lib/api/response'

/** Klijentske radnje admin panela: sve idu na `/api/admin/*` (auth admin, audit log na serveru). */
async function call<T>(path: string, method: string, json: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(json ?? {}),
  })
  const data = (await res.json()) as ApiResponse<T>
  if (!data.ok) throw new Error(data.error.message)
  return data.data
}

function useAction() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  async function run<T>(fn: () => Promise<T>, success: string | ((r: T) => string), after?: (r: T) => void) {
    setBusy(true)
    setMessage(null)
    try {
      const r = await fn()
      setMessage({ ok: true, text: typeof success === 'string' ? success : success(r) })
      if (after) after(r)
      else router.refresh()
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Radnja nije uspela.' })
    } finally {
      setBusy(false)
    }
  }
  return { busy, message, run, router }
}

function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null
  return (
    <p role={m.ok ? 'status' : 'alert'} className={`text-sm ${m.ok ? 'text-success' : 'text-destructive'}`}>
      {m.text}
    </p>
  )
}

function Box({ title, children, danger }: { title: string; children: ReactNode; danger?: boolean }) {
  return (
    <div className={`space-y-2 rounded-md border p-3 ${danger ? 'border-destructive/40' : ''}`}>
      <p className={`text-sm font-medium ${danger ? 'text-destructive' : ''}`}>{title}</p>
      {children}
    </div>
  )
}

export function TokenAdjustForm({
  userId,
  workspaces,
}: {
  userId: string
  workspaces: Array<{ id: string; name: string; available: number }>
}) {
  const a = useAction()
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? '')
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  if (!workspaces.length)
    return <p className="text-sm text-muted-foreground">Korisnik nije član nijednog radnog prostora.</p>
  return (
    <Box title="Tokeni: dodaj ili oduzmi">
      <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
        <select
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          aria-label="Radni prostor"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} ({w.available} dostupno)
            </option>
          ))}
        </select>
        <Input
          type="number"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          placeholder="npr. 100 ili -50"
          aria-label="Promena"
        />
      </div>
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Razlog (obavezno, upisuje se u ledger i audit)"
        maxLength={300}
        aria-label="Razlog"
      />
      <Button
        size="sm"
        disabled={a.busy || !delta || Number(delta) === 0 || reason.trim().length < 5}
        onClick={() =>
          a.run(
            () =>
              call<{ before: number; after: number }>(`/api/admin/users/${userId}/tokens`, 'POST', {
                workspaceId,
                delta: Number(delta),
                reason,
              }),
            (r) => `Stanje: ${r.before} → ${r.after} tokena.`,
          )
        }
      >
        Primeni
      </Button>
      <Msg m={a.message} />
    </Box>
  )
}

export function UserControls({
  userId,
  email,
  isBanned,
  emailVerified,
  isAdmin,
  isSelf,
}: {
  userId: string
  email: string
  isBanned: boolean
  emailVerified: boolean
  isAdmin: boolean
  isSelf: boolean
}) {
  const a = useAction()
  const [banReason, setBanReason] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const protectedUser = isAdmin || isSelf
  return (
    <div className="space-y-3">
      <Box title="Nalog">
        <div className="flex flex-wrap gap-2">
          {isBanned ? (
            <Button
              size="sm"
              variant="outline"
              disabled={a.busy}
              onClick={() =>
                a.run(() => call(`/api/admin/users/${userId}/unban`, 'POST', {}), 'Nalog je odblokiran.')
              }
            >
              Odblokiraj
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={a.busy || isSelf}
            onClick={() =>
              a.run(
                () => call<{ sessions: number }>(`/api/admin/users/${userId}/logout`, 'POST', {}),
                (r) => `Odjavljeno sa ${r.sessions} uređaja.`,
              )
            }
          >
            Odjavi sa svih uređaja
          </Button>
          {!emailVerified ? (
            <Button
              size="sm"
              variant="outline"
              disabled={a.busy}
              onClick={() =>
                a.run(
                  () => call(`/api/admin/users/${userId}/resend-verification`, 'POST', {}),
                  'Poruka za potvrdu je poslata.',
                )
              }
            >
              Ponovo pošalji verifikaciju
            </Button>
          ) : null}
        </div>
        {!isBanned && !protectedUser ? (
          <div className="flex flex-wrap gap-2">
            <Input
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Razlog blokade"
              className="max-w-sm"
              maxLength={300}
              aria-label="Razlog blokade"
            />
            <Button
              size="sm"
              variant="destructive"
              disabled={a.busy || banReason.trim().length < 5}
              onClick={() =>
                a.run(
                  () => call(`/api/admin/users/${userId}/ban`, 'POST', { reason: banReason }),
                  'Nalog je blokiran i odjavljen.',
                )
              }
            >
              Blokiraj
            </Button>
          </div>
        ) : null}
        <Msg m={a.message} />
      </Box>
      {!protectedUser ? (
        <Box title="Brisanje naloga" danger>
          <p className="text-xs text-muted-foreground">
            Briše nalog i radne prostore u kojima je korisnik sam. Vlasnik tima mora prvo da prenese
            vlasništvo. Za potvrdu upišite email: {email}
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={email}
              className="max-w-sm"
              aria-label="Potvrda emailom"
            />
            <Button
              size="sm"
              variant="destructive"
              disabled={a.busy || confirmEmail.trim().toLowerCase() !== email.toLowerCase()}
              onClick={() =>
                a.run(
                  () =>
                    call<{ workspacesDeleted: number }>(`/api/admin/users/${userId}/delete`, 'POST', {
                      confirmEmail,
                    }),
                  'Nalog je obrisan.',
                  () => a.router.push('/admin/users' as Route),
                )
              }
            >
              Obriši nalog
            </Button>
          </div>
        </Box>
      ) : null}
    </div>
  )
}

export function ImpersonateForm({
  userId,
  email,
  disabled,
}: {
  userId: string
  email: string
  disabled?: string | null
}) {
  const a = useAction()
  const [reason, setReason] = useState('')
  const [full, setFull] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  if (disabled) return <p className="text-sm text-muted-foreground">{disabled}</p>
  return (
    <Box title="Gledaj kao korisnik">
      <p className="text-xs text-muted-foreground">
        Sesija traje najviše 30 minuta i svaki zahtev ide u audit log. Podrazumevano samo čitanje; pun režim i
        dalje zabranjuje lozinku, email, naplatu, brisanje, mreže i objavljivanje.
      </p>
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Razlog (obavezno, najmanje 10 znakova)"
        maxLength={500}
        aria-label="Razlog impersonacije"
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />
        Pun režim (izmene u ime korisnika)
      </label>
      {full ? (
        <Input
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          placeholder={`Za potvrdu upišite ${email}`}
          aria-label="Potvrda emailom za pun režim"
        />
      ) : null}
      <Button
        size="sm"
        disabled={
          a.busy ||
          reason.trim().length < 10 ||
          (full && confirmEmail.trim().toLowerCase() !== email.toLowerCase())
        }
        onClick={() =>
          a.run(
            () =>
              call<{ redirect: string }>('/api/admin/impersonation', 'POST', {
                userId,
                reason,
                mode: full ? 'full' : 'read_only',
                confirmEmail: full ? confirmEmail : undefined,
              }),
            'Ulazim u aplikaciju kao korisnik…',
            (r) => {
              a.router.push(r.redirect as Route)
              a.router.refresh()
            },
          )
        }
      >
        Gledaj kao {email}
      </Button>
      <Msg m={a.message} />
    </Box>
  )
}

export function RetryButton({ targetId }: { targetId: string }) {
  const a = useAction()
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={a.busy}
        onClick={() =>
          a.run(
            () => call<{ scheduledAt: string }>('/api/admin/publishing/retry', 'POST', { targetId }),
            'Vraćeno u red.',
          )
        }
      >
        Pokušaj ponovo
      </Button>
      <Msg m={a.message} />
    </span>
  )
}

export function FlagToggle({ flagKey, enabled }: { flagKey: string; enabled: boolean }) {
  const a = useAction()
  const [on, setOn] = useState(enabled)
  return (
    <span className="inline-flex items-center gap-2">
      <Switch
        checked={on}
        disabled={a.busy}
        aria-label={`Flag ${flagKey}`}
        onCheckedChange={(v) => {
          const next = Boolean(v)
          setOn(next)
          void a.run(
            () => call(`/api/admin/flags/${flagKey}`, 'PATCH', { enabled: next }),
            next ? 'Uključeno.' : 'Isključeno.',
          )
        }}
      />
      {a.message && !a.message.ok ? <Msg m={a.message} /> : null}
    </span>
  )
}

export function TokenPricesForm({ prices }: { prices: Record<string, number> }) {
  const a = useAction()
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, String(v)])),
  )
  const changed = Object.entries(values).filter(([k, v]) => Number(v) !== prices[k])
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Object.keys(prices).map((k) => (
          <div key={k} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1">
            <Label htmlFor={`price-${k}`} className="text-xs font-normal">
              {k}
            </Label>
            <Input
              id={`price-${k}`}
              type="number"
              min={0}
              max={1000}
              value={values[k]}
              onChange={(e) => setValues((x) => ({ ...x, [k]: e.target.value }))}
              className="h-8 w-20 text-right"
            />
          </div>
        ))}
      </div>
      <Button
        size="sm"
        disabled={a.busy || !changed.length}
        onClick={() =>
          a.run(
            () =>
              call('/api/admin/settings/token-prices', 'PUT', {
                prices: Object.fromEntries(changed.map(([k, v]) => [k, Number(v)])),
              }),
            'Cene su sačuvane.',
          )
        }
      >
        Sačuvaj cene ({changed.length})
      </Button>
      <Msg m={a.message} />
    </div>
  )
}

export function ModelsForm({
  slots,
}: {
  slots: Array<{
    slot: string
    label: string
    current: string
    envDefault: string
    override: string | null
    options: string[]
  }>
}) {
  const a = useAction()
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(slots.map((s) => [s.slot, s.override ?? ''])),
  )
  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-2">
        {slots.map((s) => (
          <div key={s.slot} className="space-y-1 rounded-md border p-2">
            <Label htmlFor={`model-${s.slot}`} className="text-xs">
              {s.label} · sada <span className="font-mono">{s.current}</span>
            </Label>
            <select
              id={`model-${s.slot}`}
              value={values[s.slot]}
              onChange={(e) => setValues((x) => ({ ...x, [s.slot]: e.target.value }))}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">iz env-a ({s.envDefault})</option>
              {s.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <Button
        size="sm"
        disabled={a.busy}
        onClick={() =>
          a.run(
            () =>
              call('/api/admin/settings/models', 'PUT', {
                models: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v || null])),
              }),
            'Modeli su sačuvani; važe za najviše minut.',
          )
        }
      >
        Sačuvaj modele
      </Button>
      <Msg m={a.message} />
    </div>
  )
}

export function MaintenanceForm({ enabled, message }: { enabled: boolean; message: string }) {
  const a = useAction()
  const [on, setOn] = useState(enabled)
  const [text, setText] = useState(message)
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={on} onCheckedChange={(v) => setOn(Boolean(v))} aria-label="Banner za održavanje" />
        Prikaži banner svim korisnicima
      </label>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={300}
        placeholder="Poruka (npr. Večeras od 23 h radimo održavanje, objave kasne do 15 minuta.)"
      />
      <Button
        size="sm"
        disabled={a.busy}
        onClick={() =>
          a.run(
            () => call('/api/admin/settings/maintenance', 'PUT', { enabled: on, message: text }),
            'Sačuvano; banner se osvežava za najviše minut.',
          )
        }
      >
        Sačuvaj
      </Button>
      <Msg m={a.message} />
    </div>
  )
}
