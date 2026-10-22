import type { NextRequest } from "next/server";
import { withApi, ok, readJson } from "@/lib/api";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/get-user";
import { AppError } from "@/lib/errors";

// Korisnik je stigao preko linka iz mejla (callback je napravio sesiju).
export const POST = withApi(async (req: NextRequest) => {
  await requireUser({ allowBlocked: true, allowUnonboarded: true, denyImpersonation: true });
  const input = await readJson(req, resetPasswordSchema);

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: input.password });
  if (error) {
    if (error.code === "same_password") {
      throw new AppError("VALIDATION_ERROR", "Nova lozinka je ista kao stara.");
    }
    if (error.code === "weak_password") {
      throw new AppError("VALIDATION_ERROR", "Lozinka je preslaba. Bar 8 znakova.");
    }
    console.error("[reset-password]", error);
    throw new AppError("INTERNAL", "Promena lozinke nije uspela. Zatraži nov link.");
  }

  return ok({ redirect: "/dashboard" });
});
