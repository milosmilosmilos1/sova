import type { NextRequest } from "next/server";
import { withApi, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { getOrCreateCustomer } from "@/lib/stripe/customers";
import { isStripeConfigured, priceIdFor } from "@/lib/stripe/plans";
import { checkoutSchema } from "@/lib/validation/billing";

// POST /api/stripe/checkout { plan } → { url }
// Ako korisnik već ima aktivnu pretplatu, vraća URL portala (ne drugu pretplatu).
export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser({ denyImpersonation: true });
  if (!isStripeConfigured()) throw new AppError("NOT_CONFIGURED", "Plaćanje još nije podešeno.");
  const { plan } = await readJson(req, checkoutSchema);
  await enforceRateLimit("checkout", user.id);

  const supabase = await createClient();
  const { data: active } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing", "past_due"])
    .limit(1)
    .maybeSingle();

  const stripe = getStripe();
  const customer = await getOrCreateCustomer(user);
  const base = env.NEXT_PUBLIC_APP_URL;

  if (active) {
    const portal = await stripe.billingPortal.sessions.create({ customer, return_url: `${base}/settings?tab=billing` });
    return ok({ url: portal.url, reason: "already_subscribed" });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price: priceIdFor(plan), quantity: 1 }],
    success_url: `${base}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/billing/cancel`,
    allow_promotion_codes: true,
    metadata: { user_id: user.id, plan },
    subscription_data: { metadata: { user_id: user.id, plan } },
  });
  if (!session.url) throw new AppError("INTERNAL", "Stripe nije vratio link za plaćanje.");

  return ok({ url: session.url });
});
