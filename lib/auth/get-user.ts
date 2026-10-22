import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readImpersonation } from "@/lib/auth/impersonation";
import { AppError } from "@/lib/errors";
import type { Database } from "@/types/database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type CurrentUser = {
  /** Efektivni korisnik: onaj čije podatke čitamo (pri impersonaciji, ciljni). */
  id: string;
  email: string;
  profile: Profile;
  /** Pravi prijavljeni nalog (admin) kad traje impersonacija, inače null. */
  realAdmin: Profile | null;
  isImpersonating: boolean;
};

// cache(): u jednom zahtevu layout, strana i rute dobijaju isti rezultat
// bez ponovnog poziva ka auth serveru.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;

  // Impersonacija važi samo ako je prijavljeni nalog admin i cookie je potpisan.
  if (profile.role === "admin") {
    const imp = await readImpersonation();
    if (imp && imp.admin_id === profile.id && imp.user_id !== profile.id) {
      const admin = createAdminClient();
      const { data: target } = await admin
        .from("profiles")
        .select("*")
        .eq("id", imp.user_id)
        .maybeSingle();
      if (target) {
        return {
          id: target.id,
          email: target.email,
          profile: target,
          realAdmin: profile,
          isImpersonating: true,
        };
      }
    }
  }

  return { id: profile.id, email: profile.email, profile, realAdmin: null, isImpersonating: false };
});

type RequireOptions = {
  /** Dozvoli blokiranom korisniku (npr. logout, strana /blocked). */
  allowBlocked?: boolean;
  /** Dozvoli pre onboarding-a (npr. sam onboarding, business API). */
  allowUnonboarded?: boolean;
  /** Zabrani tokom impersonacije (plaćanje, lozinka, brisanje naloga). */
  denyImpersonation?: boolean;
};

/** Za API rute: baca AppError koji withApi pretvara u 401/403. */
export async function requireUser(opts: RequireOptions = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHORIZED");
  if (user.profile.is_blocked && !opts.allowBlocked) throw new AppError("BLOCKED");
  if (opts.denyImpersonation && user.isImpersonating) {
    throw new AppError("FORBIDDEN", "Ova akcija nije dozvoljena dok gledaš kao drugi korisnik.");
  }
  return user;
}

/** Za admin rute: vraća PRAVOG admina (ne impersoniranog korisnika). */
export async function requireAdmin(): Promise<Profile> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHORIZED");
  const real = user.realAdmin ?? user.profile;
  if (real.role !== "admin") throw new AppError("FORBIDDEN");
  if (real.is_blocked) throw new AppError("BLOCKED");
  return real;
}
