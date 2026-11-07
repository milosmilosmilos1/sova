'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { Badge } from '@/components/ui/badge'

/**
 * Broj nacrta koji čekaju odluku, u meniju (D-164). Početna vrednost dolazi sa servera, a strana za
 * odobrenje je menja posle svake odluke iz odgovora liste, pa se zbog broja više ne crta ceo layout
 * ponovo. Kad server ponovo nacrta layout (nova strana, osvežavanje), važi njegov broj, i kad je isti
 * kao u prethodnom crtežu (`renderId` se menja sa svakim crtežom).
 */
export function ApprovalsBadge({
  brandId,
  initial,
  renderId,
}: {
  brandId: string | null
  initial: number
  renderId: string
}) {
  const qc = useQueryClient()
  useEffect(() => {
    qc.setQueryData(['review-count', brandId], initial)
  }, [qc, brandId, initial, renderId])
  const { data } = useQuery({
    queryKey: ['review-count', brandId],
    queryFn: () => initial,
    initialData: initial,
    staleTime: Infinity,
  })
  return data ? <Badge className="ml-auto">{data}</Badge> : null
}
