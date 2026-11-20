import 'server-only'

import { redirect } from 'next/navigation'
import { cache } from 'react'

import { readinessStep } from '@/lib/brand/readiness'
import { brandReadinessById } from '@/services/brand-readiness'

/** Kompletnost brenda jednom po zahtevu: raspored (traka) i strana je čitaju u istom krugu. */
export const readinessOf = cache((brandId: string) => brandReadinessById(brandId))

/**
 * Strane koje prave, odobravaju i objavljuju sadržaj traže kompletan brend (D-174); dok nije, vode
 * na uvod, na korak sa prvom stavkom koja fali. Brend i nalog, Brain, Galerija, Mreže i podešavanja
 * ostaju otvoreni, jer se tamo brend i dopunjuje.
 */
export async function requireCompleteBrand(brandId: string): Promise<void> {
  const readiness = await readinessOf(brandId)
  if (readiness && !readiness.complete) redirect(`/app/setup?step=${readinessStep(readiness)}`)
}
