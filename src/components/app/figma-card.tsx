'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { api } from '@/components/shared/api-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export interface FigmaStatus {
  configured: boolean
  enabled: boolean
  connected: boolean
  status: string | null
  expiresAt: string | null
}

/** Kartica Figma veze u podešavanjima (D-161): status, povezivanje i prekid; veza je lična. */
export function FigmaCard({
  workspaceId,
  canEdit,
  notice,
}: {
  workspaceId: string
  canEdit: boolean
  notice: string | null
}) {
  const t = useTranslations('settings.figma')
  const qc = useQueryClient()
  const status = useQuery({
    queryKey: ['figma-status', workspaceId],
    queryFn: () => api<FigmaStatus>(`/api/figma/status?workspaceId=${workspaceId}`),
  })
  const disconnect = useMutation({
    mutationFn: () => api(`/api/figma/connection?workspaceId=${workspaceId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['figma-status', workspaceId] }),
  })
  const s = status.data
  // dok Figma ne odobri aplikaciju, kartica se vidi samo radnim prostorima kojima je uvoz uključen
  if (s && s.configured && !s.enabled) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Figma</CardTitle>
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
        {s && s.configured && s.enabled ? (
          <div className="flex flex-wrap items-center gap-2">
            {s.connected ? (
              <>
                <Badge>{t('connected')}</Badge>
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
                        href={`/api/integrations/figma/connect?workspaceId=${workspaceId}&redirectTo=/app/settings?figma=connected`}
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
