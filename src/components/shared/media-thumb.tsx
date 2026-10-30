import { Play } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Sličica prvog medija objave u listama. Video ne može u <img>, pa pokazuje prvi kadar
 * (`#t=0.1` traži kadar i od Safarija) sa oznakom za pokretanje.
 */
export function MediaThumb({ url, kind, className }: { url: string; kind: string; className?: string }) {
  if (kind === 'video')
    return (
      <span className={cn('relative shrink-0 overflow-hidden bg-muted', className)}>
        <video
          src={`${url}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          className="size-full object-cover"
          aria-hidden
        />
        <Play className="absolute inset-0 m-auto size-4 fill-white text-white drop-shadow" aria-hidden />
      </span>
    )
  // eslint-disable-next-line @next/next/no-img-element -- potpisan URL iz skladišta
  return <img src={url} alt="" className={cn('shrink-0 object-cover', className)} />
}
