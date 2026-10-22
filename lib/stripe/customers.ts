import "server-only";
import { getStripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/lib/auth/get-user";

// Stripe customer se pravi jednom po korisniku i pamti u stripe_customers.
// Ako već postoji u Stripe-u sa istim mejlom (ponovna registracija), vežemo ga.
export async function getOrCreateCustomer(user: CurrentUser): Promise<string> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("stripe_customers").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (existing) return existing.stripe_customer_id;

  const stripe = getStripe();
  let customerId: string | null = null;

  const found = await stripe.customers.list({ email: user.email, limit: 1 });
  if (found.data[0] && !found.data[0].deleted) {
    customerId = found.data[0].id;
    await stripe.customers.update(customerId, { metadata: { user_id: user.id } });
  } else {
    const created = await stripe.customers.create({
      email: user.email,
      name: user.profile.full_name ?? undefined,
      metadata: { user_id: user.id },
    });
    customerId = created.id;
  }

  const { error } = await admin.from("stripe_customers").upsert({ user_id: user.id, stripe_customer_id: customerId }, { onConflict: "user_id" });
  if (error) console.error("[stripe] upis customer-a", error.message);
  return customerId;
}

export async function userIdForCustomer(customerId: string | null | undefined): Promise<string | null> {
  if (!customerId) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("stripe_customers").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
  return data?.user_id ?? null;
}
