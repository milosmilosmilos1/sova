import { assertViewer, createHandler } from '@/lib/api/handler'
import { activateAccountsSchema } from '@/lib/schemas/social'
import { activateSocialAccounts } from '@/services/social/accounts'

/** Izbor naloga posle OAuth-a: izabrani postaju aktivni (+ uvoz istorije), ostali se brišu. */
export const POST = createHandler(
  { auth: 'verified', body: activateAccountsSchema },
  async ({ viewer, body }) => activateSocialAccounts(assertViewer(viewer), body),
)
