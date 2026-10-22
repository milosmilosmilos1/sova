// Offline test Stripe webhook-a: potpisuje lažne događaje istim algoritmom kao
// Stripe (stripe.webhooks.generateTestHeaderString) i šalje ih dev serveru.
// Proverava: dodelu tokena na invoice.paid, idempotentnost (isti event 2x,
// isti račun pod drugim event id-jem), status pretplate, neuspelu naplatu,
// povraćaj novca, loš potpis, brisanje naloga.
//
// Pokretanje:  node --env-file=.env.local scripts/test-stripe.mjs

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").replace(/\/$/, "");
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const PRICE_M = process.env.STRIPE_PRICE_MONTHLY;
const PRICE_Y = process.env.STRIPE_PRICE_YEARLY;
if (!SECRET || !PRICE_M || !PRICE_Y) {
  console.error("Fale STRIPE_WEBHOOK_SECRET / STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY u .env.local");
  process.exit(1);
}
const stripe = new Stripe("sk_test_nije_pravi_kljuc");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failed++;
}

let seq = 0;
function evt(type, object, id) {
  return { id: id ?? `evt_test_${Date.now()}_${seq++}`, object: "event", type, created: Math.floor(Date.now() / 1000), data: { object }, api_version: "2026-01-01" };
}
async function send(event, secret = SECRET) {
  const payload = JSON.stringify(event);
  const sig = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const res = await fetch(BASE + "/api/stripe/webhook", { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": sig }, body: payload });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const balance = async (id) => (await admin.from("profiles").select("token_balance").eq("id", id).single()).data?.token_balance;

const now = Math.floor(Date.now() / 1000);
const email = `test-stripe-${Date.now()}@sova.local`;
const CUS = `cus_test_${Date.now()}`;
const SUB = `sub_test_${Date.now()}`;
let userId = null;

const subObj = (status, extra = {}) => ({
  id: SUB,
  object: "subscription",
  customer: CUS,
  status,
  cancel_at_period_end: false,
  canceled_at: null,
  metadata: { user_id: userId, plan: "monthly" },
  items: { object: "list", data: [{ id: "si_test", object: "subscription_item", price: { id: PRICE_M, object: "price", recurring: { interval: "month" } }, current_period_start: now, current_period_end: now + 30 * 86400 }] },
  ...extra,
});
const invoiceObj = (id, priceId, amount, reason) => ({
  id,
  object: "invoice",
  customer: CUS,
  amount_paid: amount,
  currency: "usd",
  status: "paid",
  billing_reason: reason,
  number: "SOVA-0001",
  created: now,
  status_transitions: { paid_at: now },
  parent: { type: "subscription_details", subscription_details: { subscription: SUB, metadata: { user_id: userId } } },
  lines: { object: "list", data: [{ id: "il_test", object: "line_item", amount, quantity: 1, pricing: { type: "price_details", price_details: { price: priceId } } }] },
});

try {
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: "Lozinka123!", email_confirm: true, user_metadata: { full_name: "Test Stripe" } });
  if (error) throw error;
  userId = created.user.id;
  await admin.from("stripe_customers").insert({ user_id: userId, stripe_customer_id: CUS });
  check("test korisnik napravljen, stanje 50", (await balance(userId)) === 50);

  // loš potpis
  const bad = await send(evt("invoice.paid", invoiceObj("in_bad", PRICE_M, 3900, "subscription_create")), "whsec_pogresan");
  check("webhook sa lošim potpisom → 400", bad.status === 400, `status ${bad.status}`);
  const noSig = await fetch(BASE + "/api/stripe/webhook", { method: "POST", body: "{}" });
  check("webhook bez potpisa → 400", noSig.status === 400, `status ${noSig.status}`);

  // checkout.session.completed
  const cs = await send(evt("checkout.session.completed", { id: "cs_test_1", object: "checkout.session", customer: CUS, client_reference_id: userId, metadata: { user_id: userId, plan: "monthly" }, subscription: SUB }));
  check("checkout.session.completed → 200 handled", cs.status === 200 && cs.json?.handled === true, `status ${cs.status}`);

  // subscription.created
  const sc = await send(evt("customer.subscription.created", subObj("active")));
  const { data: subRow } = await admin.from("subscriptions").select("*").eq("stripe_subscription_id", SUB).maybeSingle();
  check("subscription.created → red u subscriptions, plan monthly, active", sc.status === 200 && subRow?.plan === "monthly" && subRow?.status === "active" && subRow?.current_period_end, `status ${sc.status}`);

  // invoice.paid → +500
  const inv1 = evt("invoice.paid", invoiceObj("in_test_1_" + Date.now(), PRICE_M, 3900, "subscription_create"));
  const ip = await send(inv1);
  check("invoice.paid (mesečni) → stanje 550", ip.status === 200 && (await balance(userId)) === 550, `status ${ip.status} stanje=${await balance(userId)}`);
  const { data: pay } = await admin.from("payments").select("*").eq("stripe_invoice_id", inv1.data.object.id).maybeSingle();
  check("payments red: 3900 centi, tokens_granted 500, paid", pay?.amount_paid === 3900 && pay?.tokens_granted === 500 && pay?.status === "paid");

  // isti event ponovo
  const dup = await send(inv1);
  check("isti event 2x → 200 duplicate, stanje ostaje 550", dup.status === 200 && dup.json?.duplicate === true && (await balance(userId)) === 550, `status ${dup.status} stanje=${await balance(userId)}`);

  // isti račun pod novim event id
  const inv1b = { ...inv1, id: "evt_test_other_" + Date.now() };
  const dup2 = await send(inv1b);
  check("isti račun pod drugim event id → tokeni se ne dodaju ponovo", dup2.status === 200 && (await balance(userId)) === 550, `stanje=${await balance(userId)}`);

  // proracija (iznos 0 ili negativan) → bez tokena
  const pro = await send(evt("invoice.paid", { ...invoiceObj("in_test_pro_" + Date.now(), PRICE_Y, 0, "subscription_update"), lines: { object: "list", data: [{ id: "il_p", object: "line_item", amount: -1200, quantity: 1, pricing: { type: "price_details", price_details: { price: PRICE_M } } }] } }));
  check("račun sa negativnom stavkom (proracija) → bez tokena", pro.status === 200 && (await balance(userId)) === 550, `stanje=${await balance(userId)}`);

  // obnova godišnjeg → +6000
  const invY = evt("invoice.paid", invoiceObj("in_test_y_" + Date.now(), PRICE_Y, 19900, "subscription_cycle"));
  const ipy = await send(invY);
  check("invoice.paid (godišnji) → +6000 = 6550", ipy.status === 200 && (await balance(userId)) === 6550, `stanje=${await balance(userId)}`);

  // subscription.updated: otkazano na kraju perioda
  const su = await send(evt("customer.subscription.updated", subObj("active", { cancel_at_period_end: true })));
  const { data: subRow2 } = await admin.from("subscriptions").select("cancel_at_period_end").eq("stripe_subscription_id", SUB).single();
  check("subscription.updated → cancel_at_period_end = true", su.status === 200 && subRow2?.cancel_at_period_end === true);

  // payment_failed
  const pf = await send(evt("invoice.payment_failed", { ...invoiceObj("in_test_f_" + Date.now(), PRICE_M, 0, "subscription_cycle"), status: "open", amount_paid: 0 }));
  const { data: failedPay } = await admin.from("payments").select("status").eq("user_id", userId).eq("status", "open").maybeSingle();
  check("invoice.payment_failed → payments red sa statusom open", pf.status === 200 && failedPay?.status === "open");

  const sp = await send(evt("customer.subscription.updated", subObj("past_due")));
  const { data: subRow3 } = await admin.from("subscriptions").select("status").eq("stripe_subscription_id", SUB).single();
  check("subscription past_due", sp.status === 200 && subRow3?.status === "past_due");

  // povraćaj godišnje uplate → −6000
  const rf = await send(evt("charge.refunded", { id: "ch_test_1", object: "charge", customer: CUS, amount: 19900, amount_refunded: 19900, refunded: true, metadata: {} }));
  check("charge.refunded (pun iznos) → stanje 550, payment refunded", rf.status === 200 && (await balance(userId)) === 550, `stanje=${await balance(userId)}`);
  const { data: refPay } = await admin.from("payments").select("status").eq("stripe_invoice_id", invY.data.object.id).single();
  check("payments red označen refunded", refPay?.status === "refunded");

  // nepoznat customer → handled false, ali 200 (ne želimo da Stripe ponavlja)
  const unk = await send(evt("invoice.paid", { ...invoiceObj("in_unk_" + Date.now(), PRICE_M, 3900, "subscription_create"), customer: "cus_nepoznat", parent: { type: "subscription_details", subscription_details: { subscription: "sub_x", metadata: {} } } }));
  check("nepoznat customer → 200 handled:false", unk.status === 200 && unk.json?.handled === false, `status ${unk.status}`);

  // stripe_events evidencija
  const { data: events } = await admin.from("stripe_events").select("id, status").like("id", "evt_test_%");
  check("svi test događaji u stripe_events sa statusom processed", (events?.length ?? 0) >= 10 && events.every((e) => e.status === "processed"), `n=${events?.length}`);

  // brisanje naloga kroz API (prijava pa DELETE); pretplata na canceled da ne zove Stripe sa lažnim ključem
  await admin.from("subscriptions").update({ status: "canceled" }).eq("stripe_subscription_id", SUB);
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const login = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ email, password: "Lozinka123!" }) });
  const cookies = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const del = await fetch(BASE + "/api/account", { method: "DELETE", headers: { Origin: BASE, Cookie: cookies } });
  const delJson = await del.json().catch(() => null);
  const { data: gone } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
  check("DELETE /api/account → 200 i korisnik obrisan (cascade)", del.status === 200 && delJson?.data?.deleted === true && !gone, `status ${del.status} ${delJson?.error?.message ?? ""}`);
  if (!gone) userId = null;
  void anon;
} catch (e) {
  console.error("Test je pukao:", e);
  failed++;
} finally {
  await admin.from("stripe_events").delete().like("id", "evt_test_%");
  if (userId) await admin.auth.admin.deleteUser(userId);
}

console.log(failed === 0 ? "\nSve prošlo." : `\n${failed} provera nije prošlo.`);
process.exit(failed === 0 ? 0 : 1);
