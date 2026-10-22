import type { NextRequest } from "next/server";
import { withApi, ok, readJson, clientIp } from "@/lib/api";
import { loginSchema } from "@/lib/validation/auth";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";

export const POST = withApi(async (req: NextRequest) => {
  const input = await readJson(req, loginSchema);
  await enforceRateLimit("login", clientIp(req));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error) {
    if (error.code === "email_not_confirmed") throw new AppError("EMAIL_NOT_CONFIRMED");
    if (error.code === "invalid_credentials" || error.status === 400) {
      throw new AppError("UNAUTHORIZED", "Pogrešan mejl ili lozinka.");
    }
    if (error.status === 429) throw new AppError("RATE_LIMITED");
    console.error("[login]", error);
    throw new AppError("INTERNAL", "Prijava trenutno ne radi. Pokušaj za minut.");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_blocked, onboarding_completed")
    .eq("id", data.user.id)
    .maybeSingle();

  let redirect = "/dashboard";
  if (profile?.is_blocked) redirect = "/blocked";
  else if (!profile?.onboarding_completed) redirect = "/onboarding";

  return ok({ redirect });
});
