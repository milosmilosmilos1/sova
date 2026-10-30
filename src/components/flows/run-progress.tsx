'use client'

import { useQuery } from '@tanstack/react-query'
import { Check, Loader2, Sparkles, X } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { api } from '@/components/shared/api-client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export interface RunView {
  id: string
  flowId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  step: 'copy' | 'images' | 'check' | 'done' | null
  postId: string | null
  error: string | null
}

const STEPS = ['copy', 'images', 'check', 'done'] as const

/**
 * Prozor napretka za „Generiši odmah” (D-108): koraci prolaza toka uživo (proverava na 2 s), a
 * kad je nacrt gotov, vodi na njega. Prozor sme da se zatvori, prolaz se nastavlja na serveru.
 */
export function RunProgress({
  runId,
  flowName,
  onClose,
}: {
  runId: string
  flowName: string
  onClose: (finished: boolean) => void
}) {
  const t = useTranslations('flows.progress')
  const run = useQuery({
    queryKey: ['flow-run', runId],
    queryFn: () => api<RunView>(`/api/flows/runs/${runId}`),
    refetchInterval: (q) =>
      q.state.data?.status === 'succeeded' || q.state.data?.status === 'failed' ? false : 2000,
  })
  const data = run.data
  const finished = data?.status === 'succeeded' || data?.status === 'failed'
  const current = data?.status === 'succeeded' ? STEPS.length : data?.step ? STEPS.indexOf(data.step) : -1

  return (
    <Dialog open onOpenChange={(open) => !open && onClose(finished)}>
      <DialogContent className="sm:max-w-md">
        <div className="-m-4 mb-0 rounded-t-xl bg-gradient-to-br from-primary to-primary/70 p-5 text-primary-foreground">
          <p className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
            <Sparkles className="size-4" aria-hidden />
            {t('badge')}
          </p>
          <DialogTitle className="mt-2 text-xl font-semibold">{t('title')}</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-primary-foreground/85">
            {t('text', { name: flowName })}
          </DialogDescription>
        </div>
        <ol className="space-y-2" aria-live="polite">
          {STEPS.map((s, i) => {
            const done = i < current || (s === 'done' && data?.status === 'succeeded')
            const active = i === current && data?.status !== 'failed' && data?.status !== 'succeeded'
            const failedHere = data?.status === 'failed' && i === Math.max(0, current)
            return (
              <li
                key={s}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm',
                  active && 'border-primary/40 bg-primary/5',
                  failedHere && 'border-destructive/40 bg-destructive/5',
                )}
              >
                <span
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-full border',
                    done && 'border-primary bg-primary text-primary-foreground',
                    failedHere && 'border-destructive bg-destructive text-white',
                  )}
                >
                  {done ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : failedHere ? (
                    <X className="size-3.5" aria-hidden />
                  ) : active ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : null}
                </span>
                <span className={cn(!done && !active && 'text-muted-foreground')}>{t(`steps.${s}`)}</span>
              </li>
            )
          })}
        </ol>
        {data?.status === 'failed' ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
          >
            {t('failed')} {data.error}
          </p>
        ) : (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{t('hint')}</p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {data?.status === 'succeeded' && data.postId ? (
            <Button nativeButton={false} render={<Link href={`/app/posts/${data.postId}`} />}>
              {t('open')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => onClose(finished)}>
            {t('close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
