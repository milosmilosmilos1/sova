import type { Metadata } from 'next'

import { AuthCard } from '@/components/auth/auth-card'
import { RegisterForm } from '@/components/auth/register-form'
import { configured } from '@/lib/env'
import { nextPathSchema } from '@/lib/schemas/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = { title: 'Registracija' }

async function registrationOpen(): Promise<boolean> {
  const { data } = await createSupabaseAdminClient()
    .from('feature_flags')
    .select('enabled')
    .eq('key', 'registration_open')
    .maybeSingle()
  return data?.enabled ?? true
}

export default async function RegisterPage({ searchParams }: PageProps<'/register'>) {
  const params = await searchParams
  const next = nextPathSchema.parse(typeof params.next === 'string' ? params.next : undefined)
  const open = await registrationOpen()
  return (
    <AuthCard title="Napravite nalog" description="Besplatno dobijate 50 tokena posle potvrde email adrese.">
      {open ? (
        <RegisterForm next={next} googleEnabled={configured.google} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Registracija je trenutno zatvorena. Pokušajte kasnije.
        </p>
      )}
    </AuthCard>
  )
}
