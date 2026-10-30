import { redirect } from 'next/navigation'

import { FlowWizard, type WizardFlow } from '@/components/flows/flow-wizard'
import { getCurrentBrand } from '@/lib/auth/brand'
import { getViewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, getCurrentWorkspace } from '@/lib/auth/workspace'
import { getBrand } from '@/services/brands'
import { resolveDesign } from '@/services/design/brand-design'
import { getFlow } from '@/services/flows/flows'
import { listSocialAccounts } from '@/services/social/accounts'

/** Zajednička strana čarobnjaka toka (nov tok i izmena), D-108. */
export async function FlowWizardPage({ flowId }: { flowId: string | null }) {
  const viewer = await getViewer()
  if (!viewer) redirect(`/login?next=/app/flows/${flowId ?? 'new'}`)
  const current = await getCurrentWorkspace(viewer)
  if (!current) redirect('/app/onboarding')
  const summary = await getCurrentBrand(viewer, current.workspaceId)
  if (!summary) redirect('/app/settings')
  const flow = flowId ? await getFlow(viewer, flowId).catch(() => null) : null
  if (flowId && !flow) redirect('/app/flows')
  const brand = await getBrand(viewer, flow?.brandId ?? summary.id)
  const [design, { accounts }] = await Promise.all([
    resolveDesign(brand),
    listSocialAccounts(viewer, brand.id),
  ])
  return (
    <FlowWizard
      brandId={brand.id}
      timeZone={brand.timezone}
      flow={flow as WizardFlow | null}
      accounts={accounts
        .filter((a) => a.status === 'active')
        .map((a) => ({ id: a.id, platform: a.platform, name: a.name, username: a.username }))}
      design={{
        styleId: design.styleId,
        size: design.size,
        photoSource: design.photoSource,
        slides: design.slides,
        colors: design.colors,
      }}
      canEdit={EDIT_ROLES.includes(current.role)}
    />
  )
}
