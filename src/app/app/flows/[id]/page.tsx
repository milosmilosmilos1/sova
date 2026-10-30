import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { FlowWizardPage } from '../wizard-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('flows.wizard'))('editTitle') }
}

export default async function EditFlowPage({ params }: PageProps<'/app/flows/[id]'>) {
  const { id } = await params
  return <FlowWizardPage flowId={/^[0-9a-f-]{36}$/i.test(id) ? id : null} />
}
