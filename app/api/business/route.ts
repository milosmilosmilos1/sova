import type { NextRequest } from "next/server";
import { withApi, ok, readJson } from "@/lib/api";
import { businessSchema } from "@/lib/validation/business";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/get-user";
import { AppError } from "@/lib/errors";

// GET /api/business: podaci o biznisu (ili null pre onboarding-a).
export const GET = withApi(async () => {
  const user = await requireUser({ allowUnonboarded: true });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("[business] get", error.message);
    throw new AppError("INTERNAL");
  }
  return ok({ business: data });
});

// PUT /api/business: onboarding i podešavanja koriste istu rutu (upsert).
export const PUT = withApi(async (req: NextRequest) => {
  const user = await requireUser({ allowUnonboarded: true });
  const input = await readJson(req, businessSchema);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("businesses")
    .upsert({ ...input, user_id: user.id }, { onConflict: "user_id" })
    .select()
    .single();
  if (error) {
    console.error("[business] upsert", error.message);
    throw new AppError("INTERNAL", "Čuvanje nije uspelo. Pokušaj ponovo.");
  }

  if (!user.profile.onboarding_completed) {
    const { error: pErr } = await supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", user.id);
    if (pErr) {
      console.error("[business] onboarding flag", pErr.message);
      throw new AppError("INTERNAL");
    }
  }

  return ok({ business: data, redirect: user.profile.onboarding_completed ? null : "/dashboard" });
});
