import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";

// Cene i omotači oko funkcija u bazi. Tok: reserve → AI → commit ili release.
// Vidi PLAN.md 4.12 i 6.1.

export const TOKEN_COST = {
  text: 2,
  image_from_prompt: 8,
  image_from_photo: 8,
} as const;

export type GenerationType = keyof typeof TOKEN_COST;

export const WELCOME_TOKENS = 50;

export const PLAN_TOKENS = {
  monthly: 500,
  yearly: 6000,
} as const;

function dbError(where: string, message: string): never {
  console.error(`[tokens] ${where}:`, message);
  throw new AppError("INTERNAL");
}

/** Atomski skida tokene. Baca INSUFFICIENT_TOKENS ako nema dovoljno. */
export async function reserveTokens(userId: string, amount: number, generationId: string, currentBalance?: number) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reserve_tokens", {
    p_user_id: userId,
    p_amount: amount,
    p_generation_id: generationId,
  });
  if (error) {
    if (error.message.includes("INSUFFICIENT_TOKENS")) {
      const have = currentBalance !== undefined ? ` Treba ${amount}, imaš ${currentBalance}.` : ` Treba ${amount}.`;
      throw new AppError("INSUFFICIENT_TOKENS", `Nemaš dovoljno tokena.${have}`);
    }
    dbError("reserve", error.message);
  }
  return data as string;
}

export async function commitTokens(txId: string) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("commit_tokens", { p_tx_id: txId });
  if (error) dbError("commit", error.message);
}

/** Vraća tokene posle neuspelog generisanja. Nikad ne baca: loguje. */
export async function releaseTokens(txId: string) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("release_tokens", { p_tx_id: txId });
  if (error) console.error("[tokens] release:", error.message);
}

export async function grantTokens(
  userId: string,
  amount: number,
  type: "purchase" | "admin_adjust" | "welcome",
  opts: { stripeInvoiceId?: string; note?: string } = {},
) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("grant_tokens", {
    p_user_id: userId,
    p_amount: amount,
    p_type: type,
    p_stripe_invoice_id: opts.stripeInvoiceId ?? undefined,
    p_note: opts.note ?? undefined,
  });
  if (error) dbError("grant", error.message);
  return data as boolean;
}

export async function revokeTokens(userId: string, amount: number, opts: { stripeInvoiceId?: string; note?: string } = {}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("revoke_tokens", {
    p_user_id: userId,
    p_amount: amount,
    p_stripe_invoice_id: opts.stripeInvoiceId ?? undefined,
    p_note: opts.note ?? undefined,
  });
  if (error) dbError("revoke", error.message);
  return data as number;
}
