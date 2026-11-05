'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, LoaderCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { FigmaStatus } from '@/components/app/figma-card'
import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { customColors } from '@/lib/visuals/design/looks'
import { cn } from '@/lib/utils'

interface Frame {
  id: string
  name: string
  page: string
  width: number
  height: number
  thumb: string | null
}

interface FramesView {
  fileKey: string
  fileName: string
  frames: Frame[]
  selected: string | null
}

interface Imported {
  id: string
  nodeId: string
  name: string
  url: string
}

interface BrandProposal {
  primary: string | null
  secondary: string | null
  background: string
  fonts: { headings: string | null; body: string | null; headingsGoogle: boolean; bodyGoogle: boolean }
  logo: { assetId: string; url: string } | null
}

/**
 * Uvoz iz Figme (D-161): link fajla → okviri sa sličicama → izabrani okviri postaju slike u biblioteci
 * brenda (redom izbora, kao slajdovi karusela) ili predlog boja, fontova i logoa za temu brenda.
 */
export function FigmaImportPanel({ workspaceId, brandId }: { workspaceId: string; brandId: string }) {
  const t = useTranslations('studioTools.figmaImport')
  const router = useRouter()
  const qc = useQueryClient()
  const status = useQuery({
    queryKey: ['figma-status', workspaceId],
    queryFn: () => api<FigmaStatus>(`/api/figma/status?workspaceId=${workspaceId}`),
  })
  const connected = Boolean(status.data?.configured && status.data.enabled && status.data.connected)
  const [link, setLink] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const frames = useMutation({
    mutationFn: (url: string) =>
      api<FramesView>(`/api/figma/frames?workspaceId=${workspaceId}&url=${encodeURIComponent(url)}`),
    onSuccess: (view) => {
      setChosen(view.selected ? [view.selected] : [])
      importer.reset()
      brand.reset()
    },
  })
  const view = frames.data
  const picked = (view?.frames ?? []).filter((f) => chosen.includes(f.id))
  const ordered = chosen.map((id) => picked.find((f) => f.id === id)).filter((f): f is Frame => Boolean(f))
  const importer = useMutation({
    mutationFn: () =>
      api<{ assets: Imported[]; failed: string[] }>('/api/figma/import', {
        method: 'POST',
        json: {
          brandId,
          fileKey: view!.fileKey,
          frames: ordered.map((f) => ({ id: f.id, name: f.name.slice(0, 300), width: f.width })),
        },
      }),
  })
  const draft = useMutation({
    mutationFn: (assets: Imported[]) =>
      api<{ id: string }>('/api/posts', {
        method: 'POST',
        json: {
          brandId,
          title: view?.fileName.slice(0, 200),
          media: assets.map((a) => ({ mediaAssetId: a.id })),
        },
      }),
    onSuccess: (post) => router.push(`/app/posts/${post.id}`),
  })
  const brand = useMutation({
    mutationFn: () =>
      api<BrandProposal>('/api/figma/brand', {
        method: 'POST',
        json: { brandId, fileKey: view!.fileKey, nodeIds: ordered.slice(0, 10).map((f) => f.id) },
      }),
  })
  const apply = useMutation({
    mutationFn: (p: BrandProposal) => {
      const font = p.fonts.headingsGoogle ? p.fonts.headings : p.fonts.bodyGoogle ? p.fonts.body : null
      const body = p.fonts.bodyGoogle ? p.fonts.body : font
      return api(`/api/brands/${brandId}/design`, {
        method: 'PATCH',
        json: {
          look: 'custom',
          colors: customColors(p.primary ?? '#2563EB', p.secondary ?? p.primary ?? '#0EA5E9', p.background),
          ...(font && body ? { fonts: { headings: font, body } } : {}),
          ...(p.logo ? { logoAssetId: p.logo.assetId } : {}),
        },
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['design', brandId] }),
  })
  const [templateName, setTemplateName] = useState('')
  const saveTemplate = useMutation({
    mutationFn: () =>
      api<{ id: string; name: string }>('/api/figma/templates', {
        method: 'POST',
        json: {
          brandId,
          fileKey: view!.fileKey,
          name: (templateName.trim() || view!.fileName).slice(0, 80),
          nodeIds: ordered.slice(0, 3).map((f) => f.id),
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['figma-templates', brandId] }),
  })
  const toggle = (id: string) =>
    setChosen((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : list.length >= 20 ? list : [...list, id],
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.isPending ? <p className="text-sm text-muted-foreground">{t('checking')}</p> : null}
        <ErrorBox error={status.error} />
        {status.data && !status.data.configured ? (
          <p className="text-sm text-muted-foreground">{t('notConfigured')}</p>
        ) : null}
        {status.data?.configured && !status.data.enabled ? (
          <p className="text-sm text-muted-foreground">{t('disabled')}</p>
        ) : null}
        {status.data?.configured && status.data.enabled && !status.data.connected ? (
          <p className="text-sm">
            {t.rich('connect', {
              link: (chunks) => (
                <a
                  className="underline"
                  href={`/api/integrations/figma/connect?workspaceId=${workspaceId}&redirectTo=/app/studio/tools`}
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        ) : null}
        {connected ? (
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (link.trim()) frames.mutate(link.trim())
              }}
            >
              <Input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://www.figma.com/design/…"
                aria-label={t('linkLabel')}
              />
              <Button type="submit" variant="outline" disabled={!link.trim() || frames.isPending}>
                {frames.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                {t('show')}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">{t('linkHint')}</p>
            <ErrorBox error={frames.error} />
            {view ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{view.fileName}</span>
                  <span className="text-muted-foreground">
                    {t('chosen', { n: chosen.length, total: view.frames.length })}
                  </span>
                </div>
                {view.frames.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('noFrames')}</p>
                ) : null}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {view.frames.map((f) => {
                    const order = chosen.indexOf(f.id)
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => toggle(f.id)}
                        aria-pressed={order >= 0}
                        className="min-w-0 space-y-1 text-left"
                      >
                        <span
                          className={cn(
                            'relative block overflow-hidden rounded-md border bg-muted',
                            order >= 0 && 'ring-2 ring-primary',
                          )}
                        >
                          {f.thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element -- sličica iz Figme, važi 30 dana
                            <img
                              src={f.thumb}
                              alt=""
                              className="aspect-square w-full object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <span className="flex aspect-square items-center justify-center text-xs text-muted-foreground">
                              {t('noThumb')}
                            </span>
                          )}
                          {order >= 0 ? (
                            <span className="absolute top-1 left-1 grid size-6 place-items-center rounded-full bg-primary text-xs text-primary-foreground">
                              {order + 1}
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs">{f.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {Math.round(f.width)}×{Math.round(f.height)} · {f.page}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => importer.mutate()} disabled={!ordered.length || importer.isPending}>
                    {importer.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                    {t('import', { n: ordered.length })}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => brand.mutate()}
                    disabled={!ordered.length || brand.isPending}
                  >
                    {brand.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                    {t('brand')}
                  </Button>
                  {chosen.length ? (
                    <Button variant="ghost" onClick={() => setChosen([])}>
                      {t('clear')}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      onClick={() => setChosen(view.frames.slice(0, 20).map((f) => f.id))}
                    >
                      {t('all')}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{t('orderHint')}</p>
                <div className="space-y-2 rounded-md border border-dashed p-3">
                  <p className="text-sm font-medium">{t('templateTitle')}</p>
                  <p className="text-xs text-muted-foreground">{t('templateHint')}</p>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder={view.fileName}
                      aria-label={t('templateName')}
                      maxLength={80}
                      className="max-w-64"
                    />
                    <Button
                      variant="outline"
                      onClick={() => saveTemplate.mutate()}
                      disabled={!ordered.length || ordered.length > 3 || saveTemplate.isPending}
                    >
                      {saveTemplate.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                      {t('templateSave', { n: Math.min(3, ordered.length) })}
                    </Button>
                  </div>
                  {saveTemplate.isSuccess ? (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400">
                      {t.rich('templateSaved', {
                        name: saveTemplate.data.name,
                        link: (chunks) => (
                          <a className="underline" href="/app/brand/visual">
                            {chunks}
                          </a>
                        ),
                      })}
                    </p>
                  ) : null}
                  <ErrorBox error={saveTemplate.error} />
                </div>
                <ErrorBox error={importer.error ?? brand.error ?? draft.error ?? apply.error} />
              </div>
            ) : null}
            {importer.data ? (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">{t('imported', { n: importer.data.assets.length })}</p>
                {importer.data.failed.length ? (
                  <p className="text-xs text-destructive">
                    {t('failed', { names: importer.data.failed.join(', ') })}
                  </p>
                ) : null}
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {importer.data.assets.map((a) => (
                    // eslint-disable-next-line @next/next/no-img-element -- potpisan URL iz biblioteke
                    <img
                      key={a.id}
                      src={a.url}
                      alt={a.name}
                      className="h-24 w-auto rounded border object-cover"
                    />
                  ))}
                </div>
                {importer.data.assets.length ? (
                  <Button
                    size="sm"
                    onClick={() => draft.mutate(importer.data!.assets)}
                    disabled={draft.isPending}
                  >
                    {draft.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                    {t('draft')}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {brand.data ? (
              <div className="space-y-3 rounded-md border p-3 text-sm">
                <p className="font-medium">{t('proposal')}</p>
                <div className="flex flex-wrap items-center gap-3">
                  {[brand.data.primary, brand.data.secondary, brand.data.background].map((c, i) =>
                    c ? (
                      <span key={i} className="flex items-center gap-1.5">
                        <span className="size-6 rounded border" style={{ backgroundColor: c }} aria-hidden />
                        <span className="font-mono text-xs">{c}</span>
                      </span>
                    ) : null,
                  )}
                  {brand.data.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- logo iz Figme u biblioteci brenda
                    <img
                      src={brand.data.logo.url}
                      alt={t('logoAlt')}
                      className="h-10 w-auto rounded border bg-white p-1"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">{t('noLogo')}</span>
                  )}
                </div>
                <p className="text-xs">
                  {t('fonts', {
                    headings: brand.data.fonts.headings ?? '—',
                    body: brand.data.fonts.body ?? '—',
                  })}
                </p>
                {(brand.data.fonts.headings && !brand.data.fonts.headingsGoogle) ||
                (brand.data.fonts.body && !brand.data.fonts.bodyGoogle) ? (
                  <p className="text-xs text-muted-foreground">{t('fontNotGoogle')}</p>
                ) : null}
                <Button
                  size="sm"
                  onClick={() => apply.mutate(brand.data!)}
                  disabled={apply.isPending || apply.isSuccess}
                >
                  {apply.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                  {apply.isSuccess ? <Check aria-hidden /> : null}
                  {apply.isSuccess ? t('applied') : t('apply')}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
