// Test baze: RLS, tokeni, rate limit, storage. Pravi dva test korisnika,
// proverava da A ne vidi B, da korisnik ne može sam sebi da doda tokene,
// da funkcije za tokene rade atomski i idempotentno, pa briše sve za sobom.
//
// Pokretanje:  node --env-file=.env.local scripts/test-db.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) {
  console.error("Fale NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY u .env.local");
  process.exit(1);
}

const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const userClient = () => createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

const USERS = [
  { email: "test-a@sova.local", password: "Test1234!", name: "Test A" },
  { email: "test-b@sova.local", password: "Test1234!", name: "Test B" },
];

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failed++;
}
const errMsg = (e) => (e?.message ?? String(e)).slice(0, 120);

async function deleteTestUsers() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (USERS.some((t) => t.email === u.email)) {
      await admin.storage.from("uploads").remove([`${u.id}/test.png`]);
      const { error } = await admin.auth.admin.deleteUser(u.id);
      if (error) console.error(`brisanje ${u.email}:`, error.message);
    }
  }
}

async function createUser({ email, password, name }) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) throw error;
  return data.user;
}

async function signIn({ email, password }) {
  const c = userClient();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

try {
  await deleteTestUsers();

  // 1. Registracija → profil + 50 tokena + welcome stavka
  const a = await createUser(USERS[0]);
  const b = await createUser(USERS[1]);

  const { data: profA } = await admin.from("profiles").select("*").eq("id", a.id).single();
  check("novi korisnik ima profil sa 50 tokena i rolom user",
    profA?.token_balance === 50 && profA?.role === "user" && profA?.full_name === "Test A",
    `balance=${profA?.token_balance} role=${profA?.role}`);

  const { data: welcome } = await admin.from("token_transactions").select("*").eq("user_id", a.id);
  check("ledger ima welcome stavku +50", welcome?.length === 1 && welcome[0].type === "welcome" && welcome[0].amount === 50);

  // 2. A upisuje generaciju; B ne sme da je vidi
  const A = await signIn(USERS[0]);
  const B = await signIn(USERS[1]);

  const { data: gen, error: genErr } = await A.from("generations")
    .insert({ user_id: a.id, type: "text", prompt: "Test prompt", tokens_cost: 2 })
    .select().single();
  check("A može da upiše svoju generaciju", !genErr && gen?.id, errMsg(genErr));

  const { data: bSees } = await B.from("generations").select("id");
  check("B ne vidi generacije od A (RLS)", bSees?.length === 0, `vidi ${bSees?.length}`);

  const { data: bProfiles } = await B.from("profiles").select("id");
  check("B vidi samo svoj profil", bProfiles?.length === 1 && bProfiles[0].id === b.id, `vidi ${bProfiles?.length}`);

  const { error: fakeIns } = await B.from("generations")
    .insert({ user_id: a.id, type: "text", prompt: "Lažna", tokens_cost: 2 });
  check("B ne može da upiše generaciju na ime A", !!fakeIns, fakeIns ? "odbijeno" : "PROŠLO");

  // 3. Korisnik ne može sam sebi da promeni tokene ni rolu
  const { error: selfTokens } = await A.from("profiles").update({ token_balance: 999 }).eq("id", a.id).select();
  check("A ne može sam da promeni token_balance (trigger)", !!selfTokens, selfTokens ? errMsg(selfTokens) : "PROŠLO");

  const { error: selfRole } = await A.from("profiles").update({ role: "admin" }).eq("id", a.id).select();
  check("A ne može sam da postane admin", !!selfRole, selfRole ? "odbijeno" : "PROŠLO");

  const { error: selfName } = await A.from("profiles").update({ full_name: "Novo ime" }).eq("id", a.id).select();
  check("A može da promeni svoje ime", !selfName, errMsg(selfName));

  // 4. Funkcije za tokene: browser ne sme, server sme
  const { error: rpcDenied } = await A.rpc("reserve_tokens", { p_user_id: a.id, p_amount: 1, p_generation_id: gen.id });
  check("korisnik ne može da zove reserve_tokens", !!rpcDenied, rpcDenied ? errMsg(rpcDenied) : "PROŠLO");

  const { data: tx1, error: r1 } = await admin.rpc("reserve_tokens", { p_user_id: a.id, p_amount: 8, p_generation_id: gen.id });
  const bal1 = (await admin.from("profiles").select("token_balance").eq("id", a.id).single()).data?.token_balance;
  check("reserve_tokens 8 → stanje 42", !r1 && bal1 === 42, r1 ? errMsg(r1) : `stanje=${bal1}`);

  const { error: r2 } = await admin.rpc("reserve_tokens", { p_user_id: a.id, p_amount: 50, p_generation_id: gen.id });
  check("reserve_tokens 50 sa 42 → INSUFFICIENT_TOKENS", r2?.message?.includes("INSUFFICIENT_TOKENS"), errMsg(r2));

  const { data: balAfterRelease, error: rel } = await admin.rpc("release_tokens", { p_tx_id: tx1 });
  check("release_tokens vraća na 50", !rel && balAfterRelease === 50, rel ? errMsg(rel) : `stanje=${balAfterRelease}`);

  const { error: relTwice } = await admin.rpc("release_tokens", { p_tx_id: tx1 });
  check("release_tokens dva puta → greška", relTwice?.message?.includes("TX_NOT_RESERVED"), errMsg(relTwice));

  const { data: tx2 } = await admin.rpc("reserve_tokens", { p_user_id: a.id, p_amount: 8, p_generation_id: gen.id });
  const { error: com } = await admin.rpc("commit_tokens", { p_tx_id: tx2 });
  const txRow = (await admin.from("token_transactions").select("status").eq("id", tx2).single()).data;
  const bal2 = (await admin.from("profiles").select("token_balance").eq("id", a.id).single()).data?.token_balance;
  check("reserve + commit → stanje 42, stavka completed", !com && bal2 === 42 && txRow?.status === "completed",
    `stanje=${bal2} status=${txRow?.status}`);

  // 5. Paralelne rezervacije: 42 tokena, 6 zahteva po 8 → tačno 5 prolazi
  const results = await Promise.all(
    Array.from({ length: 6 }, () => admin.rpc("reserve_tokens", { p_user_id: a.id, p_amount: 8, p_generation_id: gen.id })),
  );
  const okCount = results.filter((r) => !r.error).length;
  const bal3 = (await admin.from("profiles").select("token_balance").eq("id", a.id).single()).data?.token_balance;
  check("6 paralelnih rezervacija po 8 sa 42 → 5 prolazi, stanje 2", okCount === 5 && bal3 === 2, `prošlo=${okCount} stanje=${bal3}`);
  for (const r of results) if (!r.error) await admin.rpc("release_tokens", { p_tx_id: r.data });

  // 6. grant_tokens idempotentno po računu
  const { data: g1 } = await admin.rpc("grant_tokens", { p_user_id: a.id, p_amount: 500, p_type: "purchase", p_stripe_invoice_id: "in_test_1", p_note: "test" });
  const { data: g2 } = await admin.rpc("grant_tokens", { p_user_id: a.id, p_amount: 500, p_type: "purchase", p_stripe_invoice_id: "in_test_1", p_note: "test" });
  const bal4 = (await admin.from("profiles").select("token_balance").eq("id", a.id).single()).data?.token_balance;
  check("grant_tokens isti račun 2x → tokeni jednom (42+500)", g1 === true && g2 === false && bal4 === 542, `g1=${g1} g2=${g2} stanje=${bal4}`);

  // 7. admin_adjust_tokens: običan korisnik ne sme, admin sme, audit se upisuje
  const { error: adjDenied } = await admin.rpc("admin_adjust_tokens", { p_admin_id: b.id, p_target_id: a.id, p_amount: 10, p_note: "x" });
  check("admin_adjust_tokens od ne-admina → FORBIDDEN", adjDenied?.message?.includes("FORBIDDEN"), errMsg(adjDenied));

  await admin.from("profiles").update({ role: "admin" }).eq("id", b.id);
  const { data: adjBal, error: adjErr } = await admin.rpc("admin_adjust_tokens", { p_admin_id: b.id, p_target_id: a.id, p_amount: -42, p_note: "test oduzimanja" });
  const { data: audit } = await admin.from("admin_audit_log").select("*").eq("admin_id", b.id);
  check("admin oduzima 42 → stanje 500 + audit zapis", !adjErr && adjBal === 500 && audit?.length === 1 && audit[0].action === "tokens_adjust",
    adjErr ? errMsg(adjErr) : `stanje=${adjBal} audit=${audit?.length}`);

  const { error: auditDel } = await admin.from("admin_audit_log").delete().eq("admin_id", b.id);
  check("audit log ne može da se obriše ni sa service role", !!auditDel, auditDel ? "odbijeno" : "PROŠLO");

  const { data: bAsAdminSees } = await B.from("generations").select("id");
  check("admin (B) sad vidi generacije od A", bAsAdminSees?.length === 1, `vidi ${bAsAdminSees?.length}`);

  // 8. rate limit
  const key = `test:${Date.now()}`;
  const rl = [];
  for (let i = 0; i < 4; i++) rl.push((await admin.rpc("check_rate_limit", { p_key: key, p_limit: 3, p_window_seconds: 60 })).data);
  check("check_rate_limit limit 3 → true,true,true,false", JSON.stringify(rl) === "[true,true,true,false]", rl.join(","));

  // 9. statistike
  const { data: stats, error: statsErr } = await A.rpc("get_user_stats", { p_user_id: a.id });
  check("get_user_stats za sebe radi", !statsErr && stats?.token_balance === 500 && Array.isArray(stats?.daily) && stats.daily.length === 30,
    statsErr ? errMsg(statsErr) : `balance=${stats?.token_balance} daily=${stats?.daily?.length}`);

  const { error: statsDenied } = await userClient().rpc("get_user_stats", { p_user_id: a.id });
  check("get_user_stats bez prijave → odbijeno", !!statsDenied, statsDenied ? "odbijeno" : "PROŠLO");

  const { data: adminStats, error: asErr } = await B.rpc("get_admin_stats");
  check("get_admin_stats kao admin radi", !asErr && adminStats?.users_total >= 2, asErr ? errMsg(asErr) : `users=${adminStats?.users_total}`);

  const { error: asDenied } = await A.rpc("get_admin_stats");
  check("get_admin_stats kao korisnik → FORBIDDEN", !!asDenied, asDenied ? "odbijeno" : "PROŠLO");

  // 10. storage: svoj folder da, tuđi ne
  const { error: upA } = await A.storage.from("uploads").upload(`${a.id}/test.png`, PNG_1x1, { contentType: "image/png" });
  check("A može da upiše u uploads/{svoj id}/", !upA, errMsg(upA));

  const { error: upWrong } = await A.storage.from("uploads").upload(`${b.id}/test.png`, PNG_1x1, { contentType: "image/png" });
  check("A ne može da upiše u uploads/{tuđi id}/", !!upWrong, upWrong ? "odbijeno" : "PROŠLO");

  await admin.from("profiles").update({ role: "user" }).eq("id", b.id);
  const { data: dlB, error: dlErr } = await B.storage.from("uploads").download(`${a.id}/test.png`);
  check("B (opet običan) ne može da skine fajl od A", !!dlErr || !dlB, dlErr ? "odbijeno" : "PROŠLO");

  const { error: badMime } = await A.storage.from("uploads").upload(`${a.id}/test.gif`, PNG_1x1, { contentType: "image/gif" });
  check("bucket odbija image/gif", !!badMime, badMime ? errMsg(badMime) : "PROŠLO");
} catch (e) {
  console.error("Test je pukao:", e);
  failed++;
} finally {
  await deleteTestUsers();
  const left = (await admin.from("profiles").select("id").in("email", USERS.map((u) => u.email))).data;
  check("čišćenje: test korisnici obrisani (cascade)", left?.length === 0);
}

console.log(failed === 0 ? "\nSve prošlo." : `\n${failed} provera nije prošlo.`);
process.exit(failed === 0 ? 0 : 1);
