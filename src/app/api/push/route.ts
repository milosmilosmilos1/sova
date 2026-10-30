import { assertViewer, createHandler } from '@/lib/api/handler'
import { getPushStatus } from '@/services/push'

/** Obaveštenja na telefonu (D-118): javni ključ za pretplatu i broj uređaja korisnika. */
export const GET = createHandler({ auth: 'user' }, async ({ viewer }) => getPushStatus(assertViewer(viewer)))
