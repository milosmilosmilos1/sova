'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

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
        <CardDescription>
          Dizajne iz Sove otvarate u Canvi, dorađujete ih i vraćate u biblioteku brenda. Veza je lična (po
          korisniku).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {notice === 'connected' ? (
          <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-900">
            Canva je povezana.
          </p>
        ) : null}
        {notice === 'denied' ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
            Povezivanje je otkazano u Canvi.
          </p>
        ) : null}
        {status.isPending ? <p className="text-muted-foreground">Proveravam vezu…</p> : null}
        {status.isError ? <p className="text-destructive">Status Canve nije učitan.</p> : null}
        {s && !s.configured ? (
          <p className="text-muted-foreground">
            Canva integracija još nije podešena na serveru (ključevi aplikacije).
          </p>
        ) : null}
        {s && s.configured && !s.enabled ? (
          <p className="text-muted-foreground">Canva integracija je privremeno isključena.</p>
        ) : null}
        {s && s.configured && s.enabled ? (
          <div className="flex flex-wrap items-center gap-2">
            {s.connected ? (
              <>
                <Badge>povezano</Badge>
                <Badge variant="outline">
                  {s.autofillAvailable ? 'Autofill dostupan' : 'bez Autofill-a (besplatan plan)'}
                </Badge>
                {canEdit ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => disconnect.mutate()}
                    disabled={disconnect.isPending}
                  >
                    Prekini vezu
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                {s.status === 'needs_reauth' ? (
                  <Badge variant="outline">veza je istekla</Badge>
                ) : (
                  <Badge variant="secondary">nije povezano</Badge>
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
                    Poveži Canvu
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
