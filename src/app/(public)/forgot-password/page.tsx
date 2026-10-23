import type { Metadata } from 'next'

import { AuthCard } from '@/components/auth/auth-card'
import { ForgotPasswordForm } from '@/components/auth/simple-forms'

export const metadata: Metadata = { title: 'Zaboravljena lozinka' }

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Zaboravljena lozinka"
      description="Unesite email i poslaćemo vam link za promenu lozinke."
    >
      <ForgotPasswordForm />
    </AuthCard>
  )
}
