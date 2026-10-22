// Snimci ekrana svih strana (desktop 1280 i telefon 500) headless Chrome-om.
// Pravi test nalog sa podacima, slika kroz /api/dev/login (samo u razvoju),
// pa briše nalog. Slike idu u %TEMP%\sova-shots.
//
// Pokretanje:  node --env-file=.env.local scripts/screenshots.mjs

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET;
const CHROME = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"].find((p) => existsSync(p));
if (!CHROME) {
  console.error("Chrome nije pronađen.");
  process.exit(1);
}
const OUT = join(process.env.TEMP ?? ".", "sova-shots");
mkdirSync(OUT, { recursive: true });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `shots-${Date.now()}@sova.local`;
const password = "Lozinka123!";
let userId = null;

function shot(name, path, width, height) {
  const url = `${BASE}/api/dev/login?secret=${encodeURIComponent(SECRET)}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&next=${encodeURIComponent(path)}`;
  const file = join(OUT, `${name}.png`);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--window-size=${width},${height}`, "--virtual-time-budget=6000", `--screenshot=${file}`, url], { stdio: "ignore" });
  console.log("  ", file);
}

try {
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Mila Petrović" } });
  if (error) throw error;
  userId = created.user.id;
  await admin.from("businesses").insert({ user_id: userId, name: "Kafić Zrno", industry: "kafić", description: "Specialty kafa i domaći kolači u Dorćolu.", tone_of_voice: "prijateljski", language: "sr", default_hashtags: ["kafa", "dorcol", "beograd"], brand_colors: ["#2563EB"] });
  await admin.from("profiles").update({ onboarding_completed: true, role: "admin" }).eq("id", userId);
  const rows = [
    { type: "text", status: "completed", prompt: "Nova jesenja ponuda: bundeva late i kolač od jabuke", output_text: "Jesen je stigla u Zrno. Bundeva late i topao kolač od jabuke, od ponedeljka, svaki dan do 18h. Dođi dok je toplo.", metadata: { hashtags: ["kafa", "dorcol", "jesen"], cta: "Vidimo se u Zrnu." }, tokens_cost: 2, model: "gemini-3.6-flash", platform: "instagram" },
    { type: "text", status: "completed", prompt: "Subotnji brunch sa živom muzikom", output_text: "Subota, 11h: brunch i akustična gitara. Rezervacije u DM.", metadata: { hashtags: ["brunch", "beograd"], cta: "Rezerviši mesto." }, tokens_cost: 2, model: "gemini-3.6-flash", platform: "facebook" },
    { type: "image_from_prompt", status: "failed", prompt: "Šolja kafe na drvenom stolu", error_code: "AI_UNAVAILABLE", tokens_cost: 8, metadata: {} },
  ];
  const gen = await admin.from("generations").insert(rows.map((r) => ({ ...r, user_id: userId, completed_at: new Date().toISOString() })));
  if (gen.error) console.error("generations insert:", gen.error.message);
  await admin.rpc("grant_tokens", { p_user_id: userId, p_amount: 500, p_type: "purchase", p_stripe_invoice_id: `in_shots_${Date.now()}`, p_note: "Stripe račun SOVA-0001 (subscription_create)" });
  await admin.from("subscriptions").insert({ user_id: userId, stripe_subscription_id: `sub_shots_${Date.now()}`, stripe_price_id: "price_test_monthly", plan: "monthly", status: "active", current_period_start: new Date().toISOString(), current_period_end: new Date(Date.now() + 30 * 86400000).toISOString() });

  const pages = [
    ["dashboard", "/dashboard"],
    ["create-text", "/create/text"],
    ["create-photo", "/create/photo"],
    ["history", "/history"],
    ["stats", "/stats"],
    ["settings-business", "/settings"],
    ["settings-billing", "/settings?tab=billing"],
    ["admin", "/admin"],
    ["admin-users", "/admin/users"],
  ];
  console.log("Snimam u", OUT);
  for (const [name, path] of pages) {
    shot(`${name}-desktop`, path, 1280, 1100);
    shot(`${name}-mobile`, path, 500, 1100);
  }
} catch (e) {
  console.error("Puklo:", e);
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId);
}
