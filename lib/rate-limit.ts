import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";

// Rate limit u Postgres-u (funkcija check_rate_limit, fiksni prozor).
// Ključ je npr. `uid:generate` ili `ip:forgot`. Vidi PLAN.md 4.5.

export const LIMITS = {
  generate: { limit: 10, windowSeconds: 60 },
  upload: { limit: 20, windowSeconds: 60 },
  checkout: { limit: 5, windowSeconds: 60 },
  forgotPassword: { limit: 5, windowSeconds: 3600 },
  register: { limit: 10, windowSeconds: 3600 },
  login: { limit: 20, windowSeconds: 600 },
} as const;

export type LimitName = keyof typeof LIMITS;

export async function enforceRateLimit(name: LimitName, subject: string) {
  const { limit, windowSeconds } = LIMITS[name];
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("check_rate_limit", {
    p_key: `${name}:${subject}`,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    // Ako baza ne odgovara, ne puštamo neograničeno: tretiramo kao grešku servera.
    console.error("[rate-limit]", error.message);
    throw new AppError("INTERNAL");
  }
  if (data === false) {
    throw new AppError("RATE_LIMITED");
  }
}
