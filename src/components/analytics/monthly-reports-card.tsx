'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { INTL_UI } from '@/i18n/config'
import type { ApiResponse } from '@/lib/api/response'
import { recentMonths } from '@/lib/reports/period'

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
  const tc = useTranslations('common')
  if (!error) return null
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {error instanceof Error ? error.message : tc('error')}
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
  const t = useTranslations('reports')
  const tc = useTranslations('common')
  const intl = INTL_UI[useLocale()]
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
    new Date(iso).toLocaleString(intl, { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' })
  // naziv meseca po jeziku interfejsa; za srpski isto što i monthLabel („oktobar 2026.”)
  const fmtMonth = (month: string) =>
    new Date(`${month}-01T12:00:00Z`).toLocaleDateString(intl, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="report-month">{t('month')}</Label>
            <select
              id="report-month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              {months.map((m, i) => (
                <option key={m} value={m}>
                  {i === 0 ? t('currentMonth', { month: fmtMonth(m) }) : fmtMonth(m)}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? t('creating') : t('create')}
          </Button>
        </div>
        <ErrorBox error={create.error ?? reports.error} />

        {reports.data?.length ? (
          <ul className="divide-y rounded-md border">
            {reports.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="font-medium">{fmtMonth(r.month)}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {r.sentTo ? (
                    <Badge variant="secondary">
                      {r.sentTo.length ? t('sentToClient', { count: r.sentTo.length }) : t('sentToTeam')}
                    </Badge>
                  ) : null}
                  <span>{t('created', { when: fmtWhen(r.createdAt) })}</span>
                  {r.url ? (
                    <a href={r.url} className="font-medium text-primary underline underline-offset-2">
                      {t('download')}
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : reports.data ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
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
              <Label htmlFor="report-emails">{t('recipientsLabel')}</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="report-emails"
                  value={emails}
                  onChange={(e) => {
                    setEmails(e.target.value)
                    save.reset()
                  }}
                  placeholder={t('placeholder')}
                  className="min-w-0 flex-1"
                  autoComplete="off"
                />
                <Button type="submit" variant="outline" disabled={save.isPending}>
                  {save.isPending ? t('saving') : tc('save')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('hint')}</p>
              {save.isSuccess ? (
                <p role="status" className="text-xs text-muted-foreground">
                  {t('saved')}
                </p>
              ) : null}
              <ErrorBox error={save.error} />
            </form>
          ) : (
            <>
              <p className="text-sm font-medium">{t('recipientsTitle')}</p>
              <p className="text-sm text-muted-foreground">
                {t('recipientsNote', {
                  list: reportEmails.length ? reportEmails.join(', ') : t('noRecipients'),
                })}
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
