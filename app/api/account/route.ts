import type { NextRequest } from "next/server";
import { createClient as createBareClient } from "@supabase/supabase-js";
import { withApi, ok, readJson } from "@/lib/api";
import { updateAccountSchema } from "@/lib/validation/auth";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/get-user";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";

// PATCH /api/account: ime i/ili lozinka. Lozinka traži trenutnu lozinku.
export const PATCH = withApi(async (req: NextRequest) => {
  const user = await requireUser({ allowUnonboarded: true, denyImpersonation: true });
  const input = await readJson(req, updateAccountSchema);
  const supabase = await createClient();

  if (input.full_name !== undefined) {
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: input.full_name })
      .eq("id", user.id);
    if (error) {
      console.error("[account] ime", error.message);
      throw new AppError("INTERNAL");
    }
  }

  if (input.new_password !== undefined) {
    // Provera trenutne lozinke na odvojenom klijentu da ne diramo sesiju.
    const probe = createBareClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: wrong } = await probe.auth.signInWithPassword({
      email: user.email,
      password: input.current_password ?? "",
    });
    if (wrong) throw new AppError("VALIDATION_ERROR", "Trenutna lozinka nije tačna.");

    const { error } = await supabase.auth.updateUser({ password: input.new_password });
    if (error) {
      if (error.code === "same_password") {
        throw new AppError("VALIDATION_ERROR", "Nova lozinka je ista kao stara.");
      }
      console.error("[account] lozinka", error.message);
      throw new AppError("INTERNAL", "Promena lozinke nije uspela.");
    }
  }

  return ok({ updated: true });
});
