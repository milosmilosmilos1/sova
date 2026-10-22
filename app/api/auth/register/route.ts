import type { NextRequest } from "next/server";
import { withApi, ok, readJson, clientIp } from "@/lib/api";
import { registerSchema } from "@/lib/validation/auth";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";

export const POST = withApi(async (req: NextRequest) => {
  const input = await readJson(req, registerSchema);
  await enforceRateLimit("register", clientIp(req));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.full_name },
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/onboarding`,
    },
  });

  if (error) {
    if (error.code === "user_already_exists" || /already registered/i.test(error.message)) {
      throw new AppError("CONFLICT", "Nalog sa ovim mejlom već postoji. Prijavi se.");
    }
    if (error.code === "weak_password") {
      throw new AppError("VALIDATION_ERROR", "Lozinka je preslaba. Bar 8 znakova.");
    }
    if (error.status === 429) throw new AppError("RATE_LIMITED");
    console.error("[register]", error);
    throw new AppError("INTERNAL", "Registracija trenutno ne radi. Pokušaj za minut.");
  }

  // Kad je potvrda mejla uključena, Supabase za postojeći mejl vrati "lažnog"
  // korisnika bez identiteta da ne bi odao da nalog postoji.
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    throw new AppError("CONFLICT", "Nalog sa ovim mejlom već postoji. Prijavi se.");
  }

  return ok({
    needsEmailConfirmation: !data.session,
    redirect: data.session ? "/onboarding" : "/check-email",
  });
});
