import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * Boja stanja objave (D-137), ista u kalendaru, na listi objava i u Odobravanju: tačka, ivica i blaga
 * podloga u boji stanja, a tekst ostaje u boji teksta teme zbog kontrasta (faza 15).
 */
const TONES = {
  sky: { dot: 'bg-sky-500', pill: 'border-sky-500/40 bg-sky-500/10' },
  emerald: { dot: 'bg-emerald-600', pill: 'border-emerald-600/40 bg-emerald-600/10' },
  orange: { dot: 'bg-orange-500', pill: 'border-orange-500/40 bg-orange-500/10' },
  amber: { dot: 'bg-amber-500', pill: 'border-amber-500/40 bg-amber-500/10' },
  red: { dot: 'bg-red-600', pill: 'border-red-600/40 bg-red-600/10' },
  zinc: { dot: 'bg-zinc-400', pill: 'border-zinc-400/40 bg-zinc-400/10' },
  quiet: { dot: 'bg-zinc-300', pill: 'border-zinc-300/50' },
} as const

const BY_STATUS: Record<string, keyof typeof TONES> = {
  scheduled: 'sky',
  approved: 'sky',
  publishing: 'sky',
  published: 'emerald',
  partially_published: 'orange',
  in_review: 'amber',
  failed: 'red',
  draft: 'zinc',
  paused: 'zinc',
  canceled: 'quiet',
  rejected: 'quiet',
}

export function statusTone(status: string): { dot: string; pill: string } {
  return TONES[BY_STATUS[status] ?? 'zinc']
}

/** Tačka u boji stanja (kalendar, filteri, liste nacrta). */
export function StatusDot({ status, className }: { status: string; className?: string }) {
  return (
    <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', statusTone(status).dot, className)} />
  )
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string
  label: string
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn(statusTone(status).pill, className)}>
      <StatusDot status={status} />
      {label}
    </Badge>
  )
}
