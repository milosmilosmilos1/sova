'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ApiResponse } from '@/lib/api/response'
import { pluralSr } from '@/lib/plural'
import { monthLabel, recentMonths } from '@/lib/reports/period'

/**
 * Mesečni PDF izveštaj (D-094): pravljenje na zahtev za izabrani mesec, lista napravljenih sa
 * linkom za preuzimanje i adrese klijenta kojima mesečni posao šalje PDF 1. u mesecu.
 */
interface ReportItem {
  id: string
  month: string
  monthLabel: string
  status: string
  url: string | null
  sentTo: string[] | null
  createdAt: string
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
  if (!data.ok) {
    const field = Object.values(data.error.fields ?? {})[0]?.[0]
    throw new Error(field ? `${data.error.message} ${field}` : data.error.message)
  }
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

const parseEmails = (value: string) =>
  value
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean)

export function MonthlyReportsCard({
  brandId,
  timezone,
  reportEmails,
  canManageRecipients,
}: {
  brandId: string
  timezone: string
  reportEmails: string[]
  canManageRecipients: boolean
}) {
  const qc = useQueryClient()
  const months = useMemo(() => recentMonths(new Date(), timezone, 12), [timezone])
  // podrazumevano prethodni, završeni mesec
  const [month, setMonth] = useState(months[1] ?? months[0]!)
  const [emails, setEmails] = useState(reportEmails.join(', '))
  const reports = useQuery({
    queryKey: ['reports', brandId],
    queryFn: () => api<ReportItem[]>(`/api/reports?brandId=${brandId}`),
  })
  const create = useMutation({
    mutationFn: () => api<ReportItem>('/api/reports', { method: 'POST', json: { brandId, month } }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['reports', brandId] })
      // link nosi Content-Disposition: attachment, pa pregledač preuzima fajl i ostaje na strani
      if (r.url) window.location.assign(r.url)
    },
  })
  const save = useMutation({
    mutationFn: () =>
      api<{ report_emails: string[] }>(`/api/brands/${brandId}`, {
        method: 'PATCH',
        json: { reportEmails: parseEmails(emails) },
      }),
    onSuccess: (b) => setEmails(b.report_emails.join(', ')),
  })
  const fmtWhen = (iso: string) =>
    new Date(iso).toLocaleString('sr-Latn-RS', { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mesečni izveštaj (PDF)</CardTitle>
        <CardDescription>
          Isti brojevi kao na ovoj strani, za ceo kalendarski mesec u zoni brenda i uz poređenje sa prethodnim
          mesecom. Prvog u mesecu ujutru izveštaj za prethodni mesec stiže sam: vlasniku i administratorima
          kao obaveštenje, a klijentu emailom ako su adrese upisane ispod.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="report-month">Mesec</Label>
            <select
              id="report-month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              {months.map((m, i) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                  {i === 0 ? ' (u toku)' : ''}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? 'Pravim PDF…' : 'Napravi PDF'}
          </Button>
        </div>
        <ErrorBox error={create.error ?? reports.error} />

        {reports.data?.length ? (
          <ul className="divide-y rounded-md border">
            {reports.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="font-medium">{r.monthLabel}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {r.sentTo ? (
                    <Badge variant="secondary">
                      {r.sentTo.length
                        ? `poslat klijentu na ${r.sentTo.length} ${pluralSr(r.sentTo.length, 'adresu', 'adrese', 'adresa')}`
                        : 'poslat timu'}
                    </Badge>
                  ) : null}
                  <span>napravljen {fmtWhen(r.createdAt)}</span>
                  {r.url ? (
                    <a href={r.url} className="font-medium text-primary underline underline-offset-2">
                      Preuzmi
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : reports.data ? (
          <p className="text-sm text-muted-foreground">Još nema napravljenih izveštaja.</p>
        ) : null}

        <div className="space-y-2 border-t pt-4">
          {canManageRecipients ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault()
                save.mutate()
              }}
            >
              <Label htmlFor="report-emails">Klijent dobija izveštaj na (do 5 adresa)</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="report-emails"
                  value={emails}
                  onChange={(e) => {
                    setEmails(e.target.value)
                    save.reset()
                  }}
                  placeholder="klijent@firma.rs, direktor@firma.rs"
                  className="min-w-0 flex-1"
                  autoComplete="off"
                />
                <Button type="submit" variant="outline" disabled={save.isPending}>
                  {save.isPending ? 'Čuvam…' : 'Sačuvaj'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Adrese odvojite zarezom. Prazno polje znači da izveštaj ide samo timu.
              </p>
              {save.isSuccess ? (
                <p role="status" className="text-xs text-muted-foreground">
                  Sačuvano.
                </p>
              ) : null}
              <ErrorBox error={save.error} />
            </form>
          ) : (
            <>
              <p className="text-sm font-medium">Klijent dobija izveštaj na</p>
              <p className="text-sm text-muted-foreground">
                {reportEmails.length ? reportEmails.join(', ') : 'nijednu adresu (izveštaj ide samo timu)'}.
                Adrese menja vlasnik ili administrator.
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
