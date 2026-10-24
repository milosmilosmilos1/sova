import { cron } from 'inngest'

import { inngest } from '@/inngest/client'
import { listBrandsDueForSiteCheck, runSiteCheck } from '@/services/brand-brain/site-check'

/**
 * Nedeljna provera sajtova (brif 5.6): ponedeljkom u 6 h po Beogradu. Ne troši tokene.
 * Svaki brend je poseban korak da pad jednog sajta ne prekine ostale.
 */
export const brandSiteCheck = inngest.createFunction(
  { id: 'brand-site-check', retries: 1, triggers: [cron('TZ=Europe/Belgrade 0 6 * * 1')] },
  async ({ step }) => {
    const brandIds = await step.run('list-brands', () => listBrandsDueForSiteCheck())
    const results: Array<{ brandId: string; checked: boolean; newUrls: number }> = []
    for (const brandId of brandIds) {
      const r = await step.run(`check-${brandId}`, () => runSiteCheck(brandId))
      results.push({ brandId, checked: r.checked, newUrls: r.newUrls })
    }
    return { brands: brandIds.length, results }
  },
)
