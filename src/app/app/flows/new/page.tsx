import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { FlowWizardPage } from '../wizard-page'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('flows.wizard'))('newTitle') }
}

export default function NewFlowPage() {
  return <FlowWizardPage flowId={null} />
}
