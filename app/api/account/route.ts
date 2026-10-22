import type { NextRequest } from "next/server";
import { createClient as createBareClient } from "@supabase/supabase-js";
import { withApi, ok, readJson } from "@/lib/api";
import { updateAccountSchema } from "@/lib/validation/auth";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/get-user";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { isStripeConfigured } from "@/lib/stripe/plans";

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

// DELETE /api/account: otkaži Stripe pretplatu, obriši fajlove, obriši auth
// korisnika (cascade briše profil, biznis, generacije, ledger). Nepovratno.
export const DELETE = withApi(async () => {
  const user = await requireUser({ allowUnonboarded: true, allowBlocked: true, denyImpersonation: true });
  const admin = createAdminClient();

  if (isStripeConfigured()) {
    const { data: subs } = await admin
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing", "past_due", "unpaid", "incomplete"]);
    const stripe = getStripe();
    for (const s of subs ?? []) {
      try {
        await stripe.subscriptions.cancel(s.stripe_subscription_id);
      } catch (e) {
        console.error("[account] otkazivanje pretplate", s.stripe_subscription_id, e instanceof Error ? e.message : e);
        throw new AppError("INTERNAL", "Nismo uspeli da otkažemo pretplatu. Pokušaj ponovo ili javi podršci.");
      }
    }
  }

  for (const bucket of ["uploads", "generated", "logos"] as const) {
    const { data: files } = await admin.storage.from(bucket).list(user.id, { limit: 1000 });
    if (files?.length) {
      await admin.storage.from(bucket).remove(files.map((f) => `${user.id}/${f.name}`));
    }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[account] brisanje", error.message);
    throw new AppError("INTERNAL", "Brisanje naloga nije uspelo. Pokušaj ponovo.");
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  return ok({ deleted: true, redirect: "/" });
});
