import type { NextRequest } from "next/server";
import { withApi, ok, readJson, clientIp } from "@/lib/api";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";

// Uvek vraća uspeh, da ne otkrije da li mejl postoji.
export const POST = withApi(async (req: NextRequest) => {
  const input = await readJson(req, forgotPasswordSchema);
  await enforceRateLimit("forgotPassword", clientIp(req));

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
    redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  });
  if (error && error.status !== 429) {
    console.error("[forgot-password]", error.message);
  }

  return ok({ sent: true });
});
