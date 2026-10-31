'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Palette } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'

/**
 * Nacrti van teme brenda (D-125): koliko nacrta koji čekaju nije u temi i dugme da ih Sova nacrta
 * ponovo u temi (isti tekst i fotografije, bez tokena). Dok posao radi, broj se osvežava sam.
 * `startKey` pokreće usklađivanje kad se promeni (posle čuvanja nove teme).
 */
export function ThemeNotice({
  brandId,
  canEdit,
  startKey = 0,
  onDone,
}: {
  brandId: string
  canEdit: boolean
  startKey?: number
  onDone?: () => void
}) {
  const t = useTranslations('design.harmonize')
  const qc = useQueryClient()
  // vreme pokretanja usklađivanja; posao radi dok ima nacrta van teme
  const [startedAt, setStartedAt] = useState(0)
  const query = useQuery({
    queryKey: ['harmonize', brandId],
    queryFn: () => api<{ offTheme: number }>(`/api/brands/${brandId}/design/harmonize`),
    refetchInterval: (q) => (startedAt && (q.state.data?.offTheme ?? 0) > 0 ? 8000 : false),
  })
  const start = useMutation({
    mutationFn: () =>
      api<{ offTheme: number }>(`/api/brands/${brandId}/design/harmonize`, { method: 'POST' }),
    onSuccess: (data) => {
      qc.setQueryData(['harmonize', brandId], data)
      if (data.offTheme) setStartedAt(Date.now())
    },
  })
  const offTheme = query.data?.offTheme ?? 0
  const running = startedAt > 0 && offTheme > 0

  // posao je gotov kad više nema nacrta van teme: lista nacrta se čita ponovo
  const finished = startedAt > 0 && query.data?.offTheme === 0
  useEffect(() => {
    if (finished) onDone?.()
  }, [finished, onDone])

  // nova tema je sačuvana: Sova odmah usklađuje nacrte koji čekaju
  const lastKey = useRef(startKey)
  const { mutate } = start
  useEffect(() => {
    if (!startKey || startKey === lastKey.current) return
    lastKey.current = startKey
    mutate()
  }, [startKey, mutate])

  if (!offTheme && !running) return null
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
    >
      {running ? (
        <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        <Palette className="size-4 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        {running ? t('running', { count: offTheme }) : t('offTheme', { count: offTheme })}
      </span>
      {canEdit && !running ? (
        <Button size="sm" disabled={start.isPending} onClick={() => start.mutate()}>
          {t('apply')}
        </Button>
      ) : null}
      <ErrorBox error={start.error} />
    </div>
  )
}
