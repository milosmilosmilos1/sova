import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, getWebhookSecret } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import {
  handleCheckoutCompleted,
  handleSubscriptionChange,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleChargeRefunded,
} from "@/lib/stripe/webhook-handlers";

// POST /api/stripe/webhook. Bez sesije; potpis je jedina provera.
// Idempotentnost: stripe_events PK = Stripe event id. Isti event dva puta →
// drugi put 200 bez posla. Greška u obradi → status failed + 500, da Stripe ponovi.

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ ok: false, error: "nema potpisa" }, { status: 400 });

  let event: Stripe.Event;
  try {
    const raw = await req.text();
    event = getStripe().webhooks.constructEvent(raw, sig, getWebhookSecret());
  } catch (e) {
    console.warn("[stripe/webhook] loš potpis:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "loš potpis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Upis pre obrade; ako red već postoji, ništa ne radimo.
  const { data: inserted, error: insErr } = await admin
    .from("stripe_events")
    .insert({ id: event.id, type: event.type, payload: event as unknown as NonNullable<Json>, status: "received" })
    .select("id")
    .maybeSingle();
  if (insErr && insErr.code !== "23505") {
    console.error("[stripe/webhook] upis eventa:", insErr.message);
    return NextResponse.json({ ok: false, error: "baza" }, { status: 500 });
  }
  if (!inserted) {
    const { data: prev } = await admin.from("stripe_events").select("status").eq("id", event.id).single();
    if (prev?.status === "processed") return NextResponse.json({ ok: true, duplicate: true });
    // Prethodni pokušaj je pao: Stripe ponovo šalje, probamo opet.
  }

  try {
    let result: { handled: boolean; note?: string } = { handled: false, note: "ignorisan tip" };
    switch (event.type) {
      case "checkout.session.completed":
        result = await handleCheckoutCompleted(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        result = await handleSubscriptionChange(event.data.object);
        break;
      case "invoice.paid":
        result = await handleInvoicePaid(event.data.object);
        break;
      case "invoice.payment_failed":
        result = await handleInvoicePaymentFailed(event.data.object);
        break;
      case "charge.refunded":
        result = await handleChargeRefunded(event.data.object);
        break;
    }

    await admin
      .from("stripe_events")
      .update({ status: "processed", processed_at: new Date().toISOString(), error: result.note ?? null })
      .eq("id", event.id);
    return NextResponse.json({ ok: true, handled: result.handled });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[stripe/webhook] ${event.type} ${event.id}:`, msg);
    await admin.from("stripe_events").update({ status: "failed", error: msg.slice(0, 500) }).eq("id", event.id);
    return NextResponse.json({ ok: false, error: "obrada" }, { status: 500 });
  }
}
