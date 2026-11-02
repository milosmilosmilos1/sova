import 'server-only'

import { storedDesignSchema } from '@/lib/schemas/design'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { peopleLookFor, type PeopleLook } from '@/lib/visuals/people'

/** Izgled ljudi za automatski izbor fotografija i snimaka brenda (D-136): jezik objava i podešavanje. */
export async function brandPeopleLook(brandId: string | null): Promise<PeopleLook> {
  if (!brandId) return 'any'
  const { data } = await createSupabaseAdminClient()
    .from('brands')
    .select('content_locale, design')
    .eq('id', brandId)
    .maybeSingle()
  if (!data) return 'any'
  const stored = storedDesignSchema.safeParse(data.design ?? {})
  return peopleLookFor(data.content_locale, stored.success ? stored.data.people : undefined)
}
