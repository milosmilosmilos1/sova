import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { userIdForCustomer } from "@/lib/stripe/customers";
import { planForPriceId, PLANS } from "@/lib/stripe/plans";
import { grantTokens, revokeTokens } from "@/lib/tokens";

// Obrada Stripe događaja. Radi SAMO iz payload-a (bez poziva ka Stripe API-ju),
// pa je idempotentna, brza i testira se bez mreže. Vidi PLAN.md 6.4 i 10.

type Result = { handled: boolean; note?: string };

function idOf(x: string | { id: string } | null | undefined): string | null {
  if (!x) return null;
  return typeof x === "string" ? x : x.id;
}

async function resolveUserId(customer: string | { id: string } | null | undefined, metadata?: Stripe.Metadata | null) {
  const fromMeta = metadata?.user_id;
  if (fromMeta) return fromMeta;
  return userIdForCustomer(idOf(customer));
}

/** checkout.session.completed: veži customer za korisnika (metadata.user_id). */
export async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<Result> {
  const userId = session.metadata?.user_id ?? session.client_reference_id;
  const customerId = idOf(session.customer);
  if (!userId || !customerId) return { handled: false, note: "nema user_id ili customer" };
  const admin = createAdminClient();
  const { error } = await admin.from("stripe_customers").upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: "user_id" });
  if (error) throw new Error(`stripe_customers upsert: ${error.message}`);
  return { handled: true };
}

/** customer.subscription.created / updated / deleted: upsert po stripe_subscription_id. */
export async function handleSubscriptionChange(sub: Stripe.Subscription): Promise<Result> {
  const userId = await resolveUserId(sub.customer, sub.metadata);
  if (!userId) return { handled: false, note: `nepoznat customer ${idOf(sub.customer)}` };

  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  const plan = planForPriceId(priceId) ?? (item?.price?.recurring?.interval === "year" ? "yearly" : "monthly");

  const admin = createAdminClient();
  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId ?? "",
      plan,
      status: sub.status,
      current_period_start: item?.current_period_start ? new Date(item.current_period_start * 1000).toISOString() : null,
      current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end,
      canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (error) throw new Error(`subscriptions upsert: ${error.message}`);
  return { handled: true };
}

/**
 * invoice.paid: JEDINO mesto gde se dodeljuju tokeni. Pokriva prvu uplatu i
 * svako obnavljanje. Za svaku stavku računa čiji je price naš plan i iznos > 0
 * dodaj tokene plana × količina. Idempotentno po stripe_invoice_id.
 */
export async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<Result> {
  const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);
  const metadata = invoice.parent?.subscription_details?.metadata ?? null;
  const userId = await resolveUserId(invoice.customer, metadata);
  if (!userId) return { handled: false, note: `nepoznat customer ${idOf(invoice.customer)}` };

  let tokens = 0;
  for (const line of invoice.lines?.data ?? []) {
    const priceId = idOf(line.pricing?.price_details?.price);
    const plan = planForPriceId(priceId);
    if (!plan || line.amount <= 0) continue;
    tokens += PLANS[plan].tokens * (line.quantity ?? 1);
  }

  const admin = createAdminClient();
  const { error: payErr } = await admin.from("payments").upsert(
    {
      user_id: userId,
      stripe_invoice_id: invoice.id!,
      stripe_subscription_id: subscriptionId,
      amount_paid: invoice.amount_paid,
      currency: invoice.currency,
      status: "paid",
      billing_reason: invoice.billing_reason,
      tokens_granted: tokens,
      paid_at: new Date((invoice.status_transitions?.paid_at ?? invoice.created) * 1000).toISOString(),
    },
    { onConflict: "stripe_invoice_id" },
  );
  if (payErr) throw new Error(`payments upsert: ${payErr.message}`);

  if (tokens === 0) return { handled: true, note: "račun bez naših planova (proracija ili 0)" };

  const granted = await grantTokens(userId, tokens, "purchase", {
    stripeInvoiceId: invoice.id!,
    note: `Stripe račun ${invoice.number ?? invoice.id} (${invoice.billing_reason ?? "?"})`,
  });
  return { handled: true, note: granted ? `dodeljeno ${tokens}` : "već dodeljeno ranije" };
}

/** invoice.payment_failed: status pretplate ide u past_due kroz subscription.updated; ovde samo zapis. */
export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<Result> {
  const userId = await resolveUserId(invoice.customer, invoice.parent?.subscription_details?.metadata ?? null);
  if (!userId) return { handled: false, note: "nepoznat customer" };
  const admin = createAdminClient();
  const { error } = await admin.from("payments").upsert(
    {
      user_id: userId,
      stripe_invoice_id: invoice.id!,
      stripe_subscription_id: idOf(invoice.parent?.subscription_details?.subscription),
      amount_paid: 0,
      currency: invoice.currency,
      status: "open",
      billing_reason: invoice.billing_reason,
      tokens_granted: 0,
    },
    { onConflict: "stripe_invoice_id" },
  );
  if (error) throw new Error(`payments upsert (failed): ${error.message}`);
  return { handled: true };
}

/**
 * charge.refunded: nađi uplatu istog iznosa za tog korisnika, skini dodeljene
 * tokene (ne ispod 0), označi refunded. Ako ne nađemo uplatu, zabeleži za admina.
 */
export async function handleChargeRefunded(charge: Stripe.Charge): Promise<Result> {
  const userId = await resolveUserId(charge.customer, charge.metadata);
  if (!userId) return { handled: false, note: "nepoznat customer" };
  const admin = createAdminClient();

  const { data: payment } = await admin
    .from("payments")
    .select("id, stripe_invoice_id, tokens_granted, amount_paid")
    .eq("user_id", userId)
    .eq("status", "paid")
    .eq("amount_paid", charge.amount)
    .order("paid_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment) return { handled: true, note: `povraćaj ${charge.id} bez odgovarajuće uplate, proveri ručno` };

  const full = charge.amount_refunded >= charge.amount;
  const toRevoke = full ? payment.tokens_granted : Math.round((payment.tokens_granted * charge.amount_refunded) / charge.amount);
  const revoked = toRevoke > 0 ? await revokeTokens(userId, toRevoke, { stripeInvoiceId: payment.stripe_invoice_id, note: `Povraćaj ${charge.id}` }) : 0;

  if (full) {
    await admin.from("payments").update({ status: "refunded" }).eq("id", payment.id);
  }
  return { handled: true, note: `skinuto ${revoked} od ${toRevoke}` };
}
