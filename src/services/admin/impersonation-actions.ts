import 'server-only'

import { IMP_COOKIE } from '@/lib/auth/impersonation-core'
import { firstIp, type Viewer } from '@/lib/auth/viewer'
import { endImpersonation } from '@/services/admin/impersonation'

/** Most između serverskih akcija (sirovi headeri) i servisa impersonacije. */
export const clearImpersonationCookieName = IMP_COOKIE

export async function endImpersonationForAdmin(
  real: Viewer,
  reason: string,
  meta: { ip: string | null; userAgent: string | null; requestId: string | null },
): Promise<{ ended: number; userId: string | null }> {
  return endImpersonation(
    {
      adminId: real.user.id,
      adminEmail: real.user.email,
      ip: firstIp(meta.ip),
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    },
    reason,
  )
}
