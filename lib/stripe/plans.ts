import "server-only";
import { env } from "@/lib/env";
import { PLAN_TOKENS } from "@/lib/tokens";

// Planovi i mapiranje Stripe price id → tokeni. ID-jevi cena su u env-u
// jer se razlikuju za test i live.

export type PlanKey = "monthly" | "yearly";

export const PLANS: Record<PlanKey, { label: string; priceLabel: string; tokens: number; amountCents: number; interval: "month" | "year" }> = {
  monthly: { label: "Mesečni", priceLabel: "39 $ mesečno", tokens: PLAN_TOKENS.monthly, amountCents: 3900, interval: "month" },
  yearly: { label: "Godišnji", priceLabel: "199 $ godišnje", tokens: PLAN_TOKENS.yearly, amountCents: 19900, interval: "year" },
};

export function isStripeConfigured() {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_MONTHLY && env.STRIPE_PRICE_YEARLY);
}

export function priceIdFor(plan: PlanKey): string {
  const id = plan === "monthly" ? env.STRIPE_PRICE_MONTHLY : env.STRIPE_PRICE_YEARLY;
  if (!id) throw new Error(`STRIPE_PRICE_${plan.toUpperCase()} nije podešen`);
  return id;
}

export function planForPriceId(priceId: string | null | undefined): PlanKey | null {
  if (!priceId) return null;
  if (priceId === env.STRIPE_PRICE_MONTHLY) return "monthly";
  if (priceId === env.STRIPE_PRICE_YEARLY) return "yearly";
  return null;
}
