'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, LoaderCircle, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import type { FigmaStatus } from '@/components/app/figma-card'
import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface TemplateView {
  id: string
  name: string
  format: 'portrait' | 'square' | 'story'
  frames: number
  createdAt: string
  active: boolean
}

const KINDS = ['cover', 'point', 'cta'] as const

/**
 * Figma šabloni brenda (D-162): pregled svakog šablona sa primerom teksta i logoom brenda, izbor
 * šablona po kom Sova crta objave i uklanjanje. Kartica se vidi kad brend ima šablon ili Figmu.
 */
export function FigmaTemplatesCard({
  brandId,
  workspaceId,
  canEdit,
}: {
  brandId: string
  workspaceId: string
  canEdit: boolean
}) {
  const t = useTranslations('design.figmaTemplates')
  const qc = useQueryClient()
  const key = ['figma-templates', brandId]
  const list = useQuery({
    queryKey: key,
    queryFn: () => api<TemplateView[]>(`/api/brands/${brandId}/design/templates`),
  })
  const status = useQuery({
    queryKey: ['figma-status', workspaceId],
    queryFn: () => api<FigmaStatus>(`/api/figma/status?workspaceId=${workspaceId}`),
  })
  const activate = useMutation({
    mutationFn: (templateId: string | null) =>
      api<TemplateView[]>(`/api/brands/${brandId}/design/templates`, {
        method: 'PATCH',
        json: { templateId },
      }),
    onSuccess: (data) => {
      qc.setQueryData(key, data)
      void qc.invalidateQueries({ queryKey: ['design', brandId] })
    },
  })
  const remove = useMutation({
    mutationFn: (templateId: string) =>
      api<TemplateView[]>(`/api/brands/${brandId}/design/templates?templateId=${templateId}`, {
        method: 'DELETE',
      }),
    onSuccess: (data) => qc.setQueryData(key, data),
  })
  const templates = list.data ?? []
  const figma = Boolean(status.data?.configured && status.data.enabled)
  if (!templates.length && !figma) return null
  const busy = activate.isPending || remove.isPending

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ErrorBox error={list.error ?? activate.error ?? remove.error} />
        {templates.length === 0 && list.data ? (
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <p>{t('empty')}</p>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
              <li>{t('guide.frame')}</li>
              <li>{t('guide.background')}</li>
              <li>{t('guide.layers')}</li>
              <li>{t('guide.import')}</li>
            </ol>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href="/app/studio/tools" />}
            >
              {t('import')}
            </Button>
          </div>
        ) : null}
        {templates.map((tpl) => (
          <div key={tpl.id} className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{tpl.name}</span>
                <Badge variant="outline">{t(`formats.${tpl.format}`)}</Badge>
                {tpl.active ? <Badge>{t('active')}</Badge> : null}
              </div>
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  {tpl.active ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => activate.mutate(null)}>
                      {t('deactivate')}
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busy} onClick={() => activate.mutate(tpl.id)}>
                      {activate.isPending && activate.variables === tpl.id ? (
                        <LoaderCircle className="animate-spin" aria-hidden />
                      ) : (
                        <Check aria-hidden />
                      )}
                      {t('activate')}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove.mutate(tpl.id)}>
                    <Trash2 aria-hidden />
                    {t('remove')}
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {KINDS.slice(0, Math.max(1, tpl.frames)).map((kind) => (
                // eslint-disable-next-line @next/next/no-img-element -- pregled šablona iz API-ja
                <img
                  key={kind}
                  src={`/api/brands/${brandId}/design/templates/preview?templateId=${tpl.id}&kind=${kind}`}
                  alt={t(`kinds.${kind}`)}
                  loading="lazy"
                  className="h-48 w-auto shrink-0 rounded border bg-muted"
                />
              ))}
            </div>
          </div>
        ))}
        {templates.length ? <p className="text-xs text-muted-foreground">{t('hint')}</p> : null}
      </CardContent>
    </Card>
  )
}
