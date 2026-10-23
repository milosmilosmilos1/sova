import type { Metadata } from 'next'

import { AuthCard } from '@/components/auth/auth-card'
import { ResetPasswordForm } from '@/components/auth/simple-forms'

export const metadata: Metadata = { title: 'Nova lozinka' }

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Nova lozinka" description="Izaberite novu lozinku za svoj nalog.">
      <ResetPasswordForm />
    </AuthCard>
  )
}
