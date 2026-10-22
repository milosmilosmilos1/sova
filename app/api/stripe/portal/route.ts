import { withApi, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/get-user";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { getOrCreateCustomer } from "@/lib/stripe/customers";
import { isStripeConfigured } from "@/lib/stripe/plans";

// POST /api/stripe/portal → { url } (kartica, otkazivanje, promena plana)
export const POST = withApi(async () => {
  const user = await requireUser({ denyImpersonation: true });
  if (!isStripeConfigured()) throw new AppError("NOT_CONFIGURED", "Plaćanje još nije podešeno.");
  const stripe = getStripe();
  const customer = await getOrCreateCustomer(user);
  const session = await stripe.billingPortal.sessions.create({
    customer,
    return_url: `${env.NEXT_PUBLIC_APP_URL}/settings?tab=billing`,
  });
  return ok({ url: session.url });
});
