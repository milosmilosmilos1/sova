'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { DocumentsPanel } from '@/components/brand/documents-panel'
import type { VoiceViewData } from '@/components/brand/voice-form'
import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { StepFooter } from './step-footer'

interface CrawlView {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'canceled'
  phase: string | null
  progress: { phase: string; percent: number } | null
  pagesFound: number
  pagesFetched: number
  errorMessage: string | null
}

const PHASES = [
  'queued',
  'prepare',
  'discover',
  'fetch',
  'visual',
  'photo_style',
  'profile',
  'embed',
  'finish',
] as const
type Phase = (typeof PHASES)[number]
const isPhase = (p: string | null | undefined): p is Phase => PHASES.includes(p as Phase)
const running = (c?: CrawlView | null) => c?.status === 'queued' || c?.status === 'running'

/**
 * Korak 3: analiza sajta (prva besplatna), PDF o brendu i ranije objave sa mreža. Bez sajta se
 * nastavlja na PDF ili na opis brenda svojim rečima.
 */
export function StepAnalysis({
  brandId,
  websiteUrl,
  canEdit,
  emailVerified,
  onBack,
  onNext,
}: {
  brandId: string
  websiteUrl: string | null
  canEdit: boolean
  emailVerified: boolean
  onBack: () => void
  onNext: () => void
}) {
  const t = useTranslations('setup.analysis')
  const qc = useQueryClient()
  const [url, setUrl] = useState(websiteUrl ?? '')
  const [noSite, setNoSite] = useState(false)
  const [startedId, setStartedId] = useState<string | null>(null)

  const crawls = useQuery({
    queryKey: ['brand-crawls', brandId],
    queryFn: () => api<CrawlView[]>(`/api/brands/${brandId}/analyze`),
  })
  const latest = crawls.data?.[0] ?? null
  const activeId = startedId ?? (running(latest) ? latest!.id : null)
  const crawl = useQuery({
    queryKey: ['brand-crawl', brandId, activeId],
    queryFn: () => api<CrawlView>(`/api/brands/${brandId}/analysis/${activeId}`),
    enabled: Boolean(activeId),
    refetchInterval: (q) => (running(q.state.data) ? 2000 : false),
  })
  const voice = useQuery({
    queryKey: ['brand-voice', brandId],
    queryFn: () => api<VoiceViewData>(`/api/brands/${brandId}/voice`),
  })
  const setup = useQuery({
    queryKey: ['setup-state', brandId],
    queryFn: () => api<{ accounts: number }>(`/api/brands/${brandId}/setup`),
  })

  const current = crawl.data ?? latest
  const analyzed = (crawls.data ?? []).some((c) => c.status === 'succeeded' || c.status === 'partial')
  const status = crawl.data?.status
  useEffect(() => {
    // profil sa sajta menja predlog glasa i boje, pa se ti podaci čitaju ponovo
    if (status === 'succeeded' || status === 'partial') {
      void qc.invalidateQueries({ queryKey: ['brand-crawls', brandId] })
      void qc.invalidateQueries({ queryKey: ['brand-voice', brandId] })
      void qc.invalidateQueries({ queryKey: ['design', brandId] })
      void qc.invalidateQueries({ queryKey: ['setup-state', brandId] })
    }
  }, [status, brandId, qc])

  const analyze = useMutation({
    mutationFn: () =>
      api<{ crawlId: string }>(`/api/brands/${brandId}/analyze`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        json: { websiteUrl: url.trim() || undefined },
      }),
    onSuccess: (r) => setStartedId(r.crawlId),
  })

  const isRunning = running(current)
  const phase = isPhase(current?.progress?.phase) ? current!.progress!.phase : null
  const posts = voice.data?.sources.posts ?? 0

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('text')}</p>
      </div>

      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-medium">{t('site')}</h3>
          <button
            type="button"
            className="text-sm text-primary hover:underline"
            aria-pressed={noSite}
            onClick={() => setNoSite(!noSite)}
          >
            {t('noSite')}
          </button>
        </div>
        {noSite ? (
          <p className="text-sm text-muted-foreground">{t('noSiteText')}</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{analyzed ? t('done') : t('siteHint')}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="setup-site">{t('siteUrl')}</Label>
                <Input
                  id="setup-site"
                  value={url}
                  placeholder="https://primer.rs"
                  autoComplete="url"
                  disabled={isRunning}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant={analyzed ? 'outline' : 'default'}
                disabled={!canEdit || !emailVerified || isRunning || analyze.isPending || !url.trim()}
                onClick={() => analyze.mutate()}
              >
                {isRunning ? t('running') : analyzed ? t('analyzeAgain') : t('analyze')}
              </Button>
            </div>
            {!emailVerified ? <p className="text-sm text-muted-foreground">{t('verifyEmail')}</p> : null}
            <ErrorBox error={analyze.error ?? crawls.error} />
            {current && (isRunning || startedId) ? (
              <div className="space-y-2 text-sm" role="status" aria-live="polite">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {current.status === 'succeeded' || current.status === 'partial'
                      ? t('succeeded')
                      : current.status === 'failed' || current.status === 'canceled'
                        ? t('failed', { error: current.errorMessage ?? current.status })
                        : phase
                          ? t(`phases.${phase}`)
                          : t('running')}
                  </span>
                  {current.pagesFound ? (
                    <span className="text-muted-foreground">
                      {t('pages', { fetched: current.pagesFetched, found: current.pagesFound })}
                    </span>
                  ) : null}
                </div>
                {isRunning ? (
                  <div className="h-2 w-full overflow-hidden rounded bg-muted" aria-hidden>
                    <div
                      className="h-full bg-primary transition-[width] duration-500"
                      style={{ width: `${Math.max(4, current.progress?.percent ?? 0)}%` }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <DocumentsHeading />
        <DocumentsPanel brandId={brandId} canEdit={canEdit} emailVerified={emailVerified} />
      </section>

      {posts ? (
        <p className="text-sm text-muted-foreground">{t('posts', { count: posts })}</p>
      ) : setup.data?.accounts === 0 ? (
        <p className="text-sm text-muted-foreground">{t('postsNone')}</p>
      ) : null}

      <StepFooter onBack={onBack} onNext={onNext} />
    </div>
  )
}

function DocumentsHeading() {
  const t = useTranslations('documents')
  return (
    <div>
      <h3 className="font-medium">{t('title')}</h3>
      <p className="text-sm text-muted-foreground">{t('description')}</p>
    </div>
  )
}
