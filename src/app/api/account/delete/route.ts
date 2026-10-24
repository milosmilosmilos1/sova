import { assertViewer, createHandler } from '@/lib/api/handler'
import { deleteAccountSchema } from '@/lib/schemas/account'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { deleteOwnAccount } from '@/services/account'

/** Brisanje sopstvenog naloga uz potvrdu emailom i lozinkom (ili svežom prijavom). */
export const POST = createHandler(
  {
    auth: 'user',
    body: deleteAccountSchema,
    rateLimit: { name: 'account-delete', limit: 5, windowSec: 3600, by: 'user' },
  },
  async ({ viewer, body }) => {
    const result = await deleteOwnAccount(assertViewer(viewer), body)
    try {
      // nalog više ne postoji: brišu se samo lokalni cookie-ji sesije
      await (await createSupabaseServerClient()).auth.signOut({ scope: 'local' })
    } catch {
      // poziv van zahteva sa cookie-jima (Bearer klijent, testovi)
    }
    return { ...result, redirect: '/login?nalog=obrisan' }
  },
)
