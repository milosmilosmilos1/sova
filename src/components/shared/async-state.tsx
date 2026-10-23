import { AlertCircle, Inbox, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Obavezna 4 stanja (brif 18): loading, error, empty, success.
 * Koristi se svuda gde se učitavaju podaci.
 */
export interface AsyncStateProps<T> {
  status: 'loading' | 'error' | 'success'
  data: T | undefined
  isEmpty?: (data: T) => boolean
  error?: { message: string; requestId?: string } | null
  onRetry?: () => void
  loading?: ReactNode
  empty?: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode }
  children: (data: T) => ReactNode
  className?: string
}

export function AsyncState<T>({
  status,
  data,
  isEmpty,
  error,
  onRetry,
  loading,
  empty,
  children,
  className,
}: AsyncStateProps<T>) {
  if (status === 'loading') {
    return (
      <div className={cn('space-y-3', className)} aria-busy="true" aria-live="polite">
        {loading ?? (
          <>
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </>
        )}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div
        role="alert"
        className={cn(
          'flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center',
          className,
        )}
      >
        <AlertCircle className="size-8 text-destructive" aria-hidden />
        <p className="font-medium">{error?.message ?? 'Došlo je do greške pri učitavanju.'}</p>
        {error?.requestId ? (
          <p className="font-mono text-xs text-muted-foreground">ID: {error.requestId}</p>
        ) : null}
        {onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            Pokušajte ponovo
          </Button>
        ) : null}
      </div>
    )
  }

  if (data === undefined || (isEmpty ? isEmpty(data) : Array.isArray(data) && data.length === 0)) {
    const Icon = empty?.icon ?? Inbox
    return (
      <div
        className={cn(
          'flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center',
          className,
        )}
      >
        <Icon className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">{empty?.title ?? 'Još nema podataka'}</p>
        {empty?.description ? (
          <p className="max-w-sm text-sm text-muted-foreground">{empty.description}</p>
        ) : null}
        {empty?.action}
      </div>
    )
  }

  return <>{children(data)}</>
}
