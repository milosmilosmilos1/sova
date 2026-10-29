'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PLATFORMS } from '@/config/platforms'
import { FORMAT_HINT, FORMAT_LABEL, POST_FORMATS, type PostFormat } from '@/config/post-formats'
import type { ApiResponse } from '@/lib/api/response'

/**
 * Autopilot (faza 10c): izbor nivoa 0–3 sa opisom, pun autopilot uz potvrdu imenom brenda i izbor
 * naloga, mesečni budžet tokena sa stanjem (80 % upozorenje, 100 % stop), rok i ponašanje za
 * neodobrene objave, „Pauziraj sve” / „Nastavi”, ručni prolaz i istorija prolaza.
 */
type Level = 0 | 1 | 2 | 3
interface View {
  brandId: string
  brandName: string
  timezone: string
  level: Level
  levels: Record<Level, { label: string; description: string }>
  tokenBudget: number | null
  approvalDeadlineHours: number
  unapprovedAction: 'skip' | 'publish'
  level3Available: boolean
  level3ConfirmedAt: string | null
  level3AccountIds: string[]
  language: 'sr-Latn' | 'sr-Cyrl' | 'en' | 'uk'
  formats: PostFormat[]
  mix: boolean
  paused: boolean
  pausedAt: string | null
  usage: {
    month: string
    used: number
    budget: number | null
    state: 'unlimited' | 'ok' | 'warning' | 'stopped'
    percent: number | null
    remaining: number | null
  }
  activeStrategy: { id: string; periodStart: string; periodEnd: string } | null
  nextWeek: { start: string; end: string }
  accounts: Array<{ id: string; name: string; platform: keyof typeof PLATFORMS; status: string }>
  runs: Array<{
    id: string
    kind: 'weekly' | 'monthly'
    periodStart: string
    level: number
    status: string
    summary: Record<string, unknown>
    tokensUsed: number
    createdAt: string
  }>
}

const RUN_STATUS: Record<string, string> = {
  running: 'u toku',
  succeeded: 'gotovo',
  partial: 'delimično',
  skipped: 'preskočeno',
  failed: 'neuspelo',
}

async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.json !== undefined) headers.set('content-type', 'application/json')
  const res = await fetch(path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })
  const data = (await res.json()) as ApiResponse<T>
  if (!data.ok) throw new Error(data.error.message)
  return data.data
}

function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {error instanceof Error ? error.message : 'Greška.'}
    </div>
  )
}

const fmtDate = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('sr-Latn-RS', { day: 'numeric', month: 'short' })

export function AutopilotClient({
  brandId,
  canAdmin,
  canEdit,
}: {
  brandId: string
  canAdmin: boolean
  canEdit: boolean
}) {
  const qc = useQueryClient()
  const view = useQuery({
    queryKey: ['autopilot', brandId],
    queryFn: () => api<View>(`/api/autopilot/${brandId}`),
  })
  const refresh = () => void qc.invalidateQueries({ queryKey: ['autopilot', brandId] })
  const pause = useMutation({
    mutationFn: () => api(`/api/autopilot/${brandId}/pause`, { method: 'POST', json: {} }),
    onSuccess: refresh,
  })
  const resume = useMutation({
    mutationFn: () => api(`/api/autopilot/${brandId}/resume`, { method: 'POST', json: {} }),
    onSuccess: refresh,
  })
  const runNow = useMutation({
    mutationFn: () =>
      api<{ weekStart: string }>(`/api/autopilot/${brandId}/run`, { method: 'POST', json: {} }),
    onSuccess: refresh,
  })
  if (view.isPending) return <p className="text-sm text-muted-foreground">Učitavam…</p>
  if (view.isError) return <ErrorBox error={view.error} />
  const v = view.data
  const u = v.usage

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Autopilot</h1>
          <p className="text-sm text-muted-foreground">
            {v.brandName} · zona {v.timezone}. Nedeljni prolaz ponedeljkom u 06:00 priprema nedelju od{' '}
            {fmtDate(v.nextWeek.start)} do {fmtDate(v.nextWeek.end)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {v.paused ? (
            canAdmin ? (
              <Button onClick={() => resume.mutate()} disabled={resume.isPending}>
                Nastavi
              </Button>
            ) : null
          ) : canEdit ? (
            <Button variant="destructive" onClick={() => pause.mutate()} disabled={pause.isPending}>
              Pauziraj sve
            </Button>
          ) : null}
          {canAdmin && v.level >= 1 && !v.paused ? (
            <Button variant="outline" onClick={() => runNow.mutate()} disabled={runNow.isPending}>
              Pripremi narednu nedelju sada
            </Button>
          ) : null}
        </div>
      </div>
      <ErrorBox error={pause.error ?? resume.error ?? runNow.error} />
      {runNow.data ? (
        <p className="text-sm text-muted-foreground">
          Prolaz za nedelju od {fmtDate(runNow.data.weekStart)} je pokrenut; nacrti stižu za nekoliko minuta.
        </p>
      ) : null}
      {pause.data || v.paused ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Brend je pauziran
          {v.pausedAt
            ? ` od ${new Date(v.pausedAt).toLocaleString('sr-Latn-RS', { timeZone: v.timezone })}`
            : ''}
          : Autopilot ne radi i zakazane objave stoje. „Nastavi” vraća u red objave čiji termin nije prošao.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <SettingsCard v={v} canAdmin={canAdmin} onSaved={refresh} />
        <ContentCard v={v} canAdmin={canAdmin} onSaved={refresh} />
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardDescription>Budžet za {u.month}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {u.used}
                <span className="text-base font-normal text-muted-foreground">
                  {' '}
                  / {u.budget ?? 'bez limita'} tokena
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {u.budget !== null ? (
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={u.percent ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Potrošnja budžeta"
                >
                  <div
                    className={`h-full rounded-full ${u.state === 'stopped' ? 'bg-destructive' : u.state === 'warning' ? 'bg-amber-500' : 'bg-primary'}`}
                    style={{ width: `${Math.min(100, u.percent ?? 0)}%` }}
                  />
                </div>
              ) : null}
              <p className="text-muted-foreground">
                {u.state === 'stopped'
                  ? 'Budžet je potrošen: Autopilot ne pravi nove nacrte do sledećeg meseca ili povećanja budžeta.'
                  : u.state === 'warning'
                    ? `Potrošeno ${u.percent} %; upozorenje je poslato vlasnicima.`
                    : u.state === 'unlimited'
                      ? 'Bez posebnog limita; troši se stanje tokena radnog prostora.'
                      : `Preostalo ${u.remaining} tokena. Tekst objave 2, vizual 2, strategija 20.`}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Aktivna strategija</CardDescription>
              <CardTitle className="text-base">
                {v.activeStrategy
                  ? `${fmtDate(v.activeStrategy.periodStart)} – ${fmtDate(v.activeStrategy.periodEnd)}`
                  : 'Nema aktivne strategije'}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {v.activeStrategy
                ? 'Nacrti se prave iz tema, stubova i termina ove strategije.'
                : v.level >= 2
                  ? 'Na nivou 2 i 3 Autopilot sam pravi strategiju pri sledećem prolazu.'
                  : 'Na nivou 1 Autopilot čeka da napravite i aktivirate strategiju.'}{' '}
              <Link href="/app/strategy" className="underline">
                Strategija
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Poslednji prolazi</CardTitle>
        </CardHeader>
        <CardContent>
          {v.runs.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2">Vrsta</th>
                  <th className="py-1 pr-2">Period od</th>
                  <th className="py-1 pr-2">Status</th>
                  <th className="py-1 pr-2">Rezultat</th>
                  <th className="py-1 text-right">Tokeni</th>
                </tr>
              </thead>
              <tbody>
                {v.runs.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="py-1 pr-2">{r.kind === 'weekly' ? 'nedeljni' : 'mesečni'}</td>
                    <td className="py-1 pr-2">{fmtDate(r.periodStart)}</td>
                    <td className="py-1 pr-2">
                      <Badge variant={r.status === 'succeeded' ? 'default' : 'outline'}>
                        {RUN_STATUS[r.status] ?? r.status}
                      </Badge>
                    </td>
                    <td className="py-1 pr-2 text-muted-foreground">{runSummary(r.summary)}</td>
                    <td className="py-1 text-right tabular-nums">{r.tokensUsed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">Još nema prolaza.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function runSummary(s: Record<string, unknown>): string {
  if (typeof s.reason === 'string') return s.reason
  const parts: string[] = []
  const n = (k: string) => (typeof s[k] === 'number' ? (s[k] as number) : 0)
  if (n('planned')) parts.push(`${n('planned')} nacrta`)
  if (n('submitted')) parts.push(`${n('submitted')} na odobrenju`)
  if (n('scheduled')) parts.push(`${n('scheduled')} zakazano`)
  if (n('returned')) parts.push(`${n('returned')} vraćeno`)
  if (s.budgetStopped) parts.push('budžet potrošen')
  if (s.suggested) parts.push('predlog strategije u Inbox-u')
  if (typeof s.strategyId === 'string' && !parts.length) parts.push('strategija napravljena')
  return parts.join(', ') || '—'
}

function SettingsCard({ v, canAdmin, onSaved }: { v: View; canAdmin: boolean; onSaved: () => void }) {
  const [level, setLevel] = useState<Level>(v.level)
  const [budget, setBudget] = useState(v.tokenBudget === null ? '' : String(v.tokenBudget))
  const [deadline, setDeadline] = useState(String(v.approvalDeadlineHours))
  const [unapproved, setUnapproved] = useState(v.unapprovedAction)
  const [accounts, setAccounts] = useState<string[]>(v.level3AccountIds)
  const [confirm, setConfirm] = useState('')
  const [saved, setSaved] = useState(false)
  const save = useMutation({
    mutationFn: () =>
      api<View>(`/api/autopilot/${v.brandId}`, {
        method: 'PATCH',
        json: {
          level,
          tokenBudget: budget.trim() === '' ? null : Number(budget),
          approvalDeadlineHours: Number(deadline),
          unapprovedAction: unapproved,
          ...(level === 3 ? { level3AccountIds: accounts, confirm } : {}),
        },
      }),
    onSuccess: () => {
      setSaved(true)
      setConfirm('')
      setTimeout(() => setSaved(false), 2500)
      onSaved()
    },
  })
  const levels = [0, 1, 2, 3] as Level[]
  const disabled = !canAdmin
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nivo automatizacije</CardTitle>
        <CardDescription>Bira se po brendu. Menjaju vlasnik i administrator.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Nivo Autopilota">
          {levels.map((l) => {
            const locked = l === 3 && !v.level3Available
            return (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={level === l}
                disabled={disabled || locked}
                onClick={() => setLevel(l)}
                className={`rounded-md border p-3 text-left text-sm disabled:opacity-50 ${level === l ? 'border-primary bg-accent/40' : 'hover:bg-accent/30'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {l} · {v.levels[l].label}
                  </span>
                  {v.level === l ? (
                    <Badge>trenutno</Badge>
                  ) : locked ? (
                    <Badge variant="outline">uskoro</Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{v.levels[l].description}</p>
              </button>
            )
          })}
        </div>

        {level === 3 ? (
          <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50/60 p-3 text-sm">
            <p className="font-medium">Pun autopilot objavljuje bez odobrenja.</p>
            <p className="text-muted-foreground">
              Izaberite naloge na kojima Sova sme da objavljuje sama; ostali nalozi i dalje idu na odobrenje.
              Isključuje se jednim klikom (izbor drugog nivoa ili „Pauziraj sve”).
            </p>
            <fieldset className="space-y-1">
              <legend className="text-xs text-muted-foreground">Nalozi</legend>
              {v.accounts
                .filter((a) => a.status === 'active')
                .map((a) => (
                  <label key={a.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={accounts.includes(a.id)}
                      disabled={disabled}
                      onChange={(e) =>
                        setAccounts((list) =>
                          e.target.checked ? [...list, a.id] : list.filter((x) => x !== a.id),
                        )
                      }
                    />
                    {a.name} <span className="text-muted-foreground">· {PLATFORMS[a.platform].label}</span>
                  </label>
                ))}
            </fieldset>
            <div className="space-y-1">
              <Label htmlFor="ap-confirm">Za potvrdu upišite naziv brenda „{v.brandName}”</Label>
              <Input
                id="ap-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={disabled}
                autoComplete="off"
              />
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="ap-budget">Mesečni budžet (tokeni)</Label>
            <Input
              id="ap-budget"
              type="number"
              min={0}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="bez limita"
              disabled={disabled}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ap-deadline">Rok za odobrenje (sati pre termina)</Label>
            <Input
              id="ap-deadline"
              type="number"
              min={1}
              max={720}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ap-unapproved">Neodobrene posle roka (nivo 2+)</Label>
            <select
              id="ap-unapproved"
              value={unapproved}
              onChange={(e) => setUnapproved(e.target.value as 'skip' | 'publish')}
              disabled={disabled}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="skip">preskoči</option>
              <option value="publish">objavi</option>
            </select>
          </div>
        </div>
        <ErrorBox error={save.error} />
        {canAdmin ? (
          <div className="flex items-center gap-3">
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || (level === 3 && (!accounts.length || !confirm.trim()))}
            >
              Sačuvaj
            </Button>
            {saved ? <span className="text-sm text-muted-foreground">Sačuvano.</span> : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Podešavanja menjaju vlasnik i administrator.</p>
        )}
      </CardContent>
    </Card>
  )
}

const AUTOPILOT_LOCALES = [
  ['sr-Latn', 'Srpski, latinica'],
  ['sr-Cyrl', 'Srpski, ćirilica'],
  ['en', 'Engleski'],
  ['uk', 'Ukrajinski'],
] as const

/**
 * Sadržaj Autopilota (D-107): jezik objava, dozvoljene vrste i da li AI meša vrste kroz nedelju.
 * Svaka mreža dobija samo vrste koje prima (Instagram nema objave bez slike, YouTube samo video).
 */
function ContentCard({ v, canAdmin, onSaved }: { v: View; canAdmin: boolean; onSaved: () => void }) {
  const [language, setLanguage] = useState(v.language)
  const [formats, setFormats] = useState<PostFormat[]>(v.formats)
  const [mix, setMix] = useState(v.mix)
  const [saved, setSaved] = useState(false)
  const save = useMutation({
    mutationFn: () =>
      api<View>(`/api/autopilot/${v.brandId}`, { method: 'PATCH', json: { language, formats, mix } }),
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      onSaved()
    },
  })
  const disabled = !canAdmin
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sadržaj</CardTitle>
        <CardDescription>
          Jezik i vrste objava koje Autopilot pravi. Tekst sa heštegovima piše Gemini, fotografije dolaze sa
          Unsplash-a, a video sa Pexels-a.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ap-language">Jezik objava</Label>
          <select
            id="ap-language"
            value={language}
            disabled={disabled}
            onChange={(e) => setLanguage(e.target.value as View['language'])}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {AUTOPILOT_LOCALES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Vrste objava</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {POST_FORMATS.map((f) => (
              <label key={f} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={formats.includes(f)}
                  disabled={disabled}
                  onChange={(e) =>
                    setFormats((cur) => (e.target.checked ? [...cur, f] : cur.filter((x) => x !== f)))
                  }
                />
                <span>
                  {FORMAT_LABEL[f]}
                  <span className="block text-xs text-muted-foreground">{FORMAT_HINT[f]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4"
            checked={mix}
            disabled={disabled}
            onChange={(e) => setMix(e.target.checked)}
          />
          <span>
            AI meša vrste
            <span className="block text-xs text-muted-foreground">
              Kroz nedelju se smenjuju izabrane vrste, a slika i karusel dolaze češće. Isključeno: uvek prva
              izabrana vrsta koju mreža prima.
            </span>
          </span>
        </label>
        <div className="flex items-center gap-3">
          <Button disabled={disabled || save.isPending || !formats.length} onClick={() => save.mutate()}>
            {save.isPending ? 'Čuvam…' : 'Sačuvaj'}
          </Button>
          {saved ? <span className="text-sm text-muted-foreground">Sačuvano.</span> : null}
          {!formats.length ? (
            <span className="text-sm text-muted-foreground">Izaberite bar jednu vrstu.</span>
          ) : null}
        </div>
        <ErrorBox error={save.error} />
      </CardContent>
    </Card>
  )
}
