'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ApiResponse } from '@/lib/api/response'

interface CanvaStatus {
  configured: boolean
  enabled: boolean
  connected: boolean
  status: string | null
  autofillAvailable: boolean
  expiresAt: string | null
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const data = (await res.json()) as ApiResponse<T>
  if (!data.ok) throw new Error(data.error.message)
  return data.data
}

/** Kartica Canva veze u podešavanjima: status, povezivanje (OAuth), prekid. */
export function CanvaCard({
  workspaceId,
  canEdit,
  notice,
}: {
  workspaceId: string
  canEdit: boolean
  notice: string | null
}) {
  const t = useTranslations('settings.canva')
  const qc = useQueryClient()
  const status = useQuery({
    queryKey: ['canva-status', workspaceId],
    queryFn: () => api<CanvaStatus>(`/api/canva/status?workspaceId=${workspaceId}`),
  })
  const disconnect = useMutation({
    mutationFn: () => api(`/api/canva/connection?workspaceId=${workspaceId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canva-status', workspaceId] }),
  })
  const s = status.data
  return (
    <Card>
      <CardHeader>
        <CardTitle>Canva</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {notice === 'connected' ? (
          <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-900">
            {t('connectedNotice')}
          </p>
        ) : null}
        {notice === 'denied' ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
            {t('deniedNotice')}
          </p>
        ) : null}
        {status.isPending ? <p className="text-muted-foreground">{t('checking')}</p> : null}
        {status.isError ? <p className="text-destructive">{t('loadFailed')}</p> : null}
        {s && !s.configured ? <p className="text-muted-foreground">{t('notConfigured')}</p> : null}
        {s && s.configured && !s.enabled ? <p className="text-muted-foreground">{t('disabled')}</p> : null}
        {s && s.configured && s.enabled ? (
          <div className="flex flex-wrap items-center gap-2">
            {s.connected ? (
              <>
                <Badge>{t('connected')}</Badge>
                <Badge variant="outline">{s.autofillAvailable ? t('autofill') : t('noAutofill')}</Badge>
                {canEdit ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => disconnect.mutate()}
                    disabled={disconnect.isPending}
                  >
                    {t('disconnect')}
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                {s.status === 'needs_reauth' ? (
                  <Badge variant="outline">{t('expired')}</Badge>
                ) : (
                  <Badge variant="secondary">{t('notConnected')}</Badge>
                )}
                {canEdit ? (
                  <Button
                    size="sm"
                    nativeButton={false}
                    render={
                      <a
                        href={`/api/integrations/canva/connect?workspaceId=${workspaceId}&redirectTo=/app/settings?canva=connected`}
                      />
                    }
                  >
                    {t('connect')}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
