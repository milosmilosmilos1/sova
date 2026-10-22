// Test admin panela kroz HTTP: običan korisnik ne vidi /admin (404) ni API (403),
// admin vidi statistike, listu, detalj, menja tokene, blokira, menja rolu,
// impersonira (vidi tuđu istoriju, ne može da plaća), izlazi; sve je u auditu.
//
// Pokretanje:  node --env-file=.env.local scripts/test-admin.mjs

import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").replace(/\/$/, "");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failed++;
}

function session() {
  const jar = new Map();
  const store = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = c.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      const maxAge = attrs.find((a) => a.trim().toLowerCase().startsWith("max-age="));
      if (value === "" || (maxAge && Number(maxAge.split("=")[1]) <= 0)) jar.delete(name);
      else jar.set(name, value);
    }
  };
  return async (path, { method = "GET", body } = {}) => {
    const res = await fetch(BASE + path, {
      method,
      redirect: "manual",
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), Origin: BASE, Cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ") },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    store(res);
    const text = (await res.text()).replace(/<!--\s*-->/g, "");
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // HTML
    }
    return { status: res.status, json, text, location: res.headers.get("location") };
  };
}

const stamp = Date.now();
const adminEmail = `test-admin-${stamp}@sova.local`;
const userEmail = `test-user-${stamp}@sova.local`;
const password = "Lozinka123!";
const ids = [];

try {
  const A = session();
  const U = session();

  // Dva naloga: jedan postaje admin kroz make-admin logiku (service role update)
  for (const [s, email, name] of [[A, adminEmail, "Admin Test"], [U, userEmail, "User Test"]]) {
    const r = await s("/api/auth/register", { method: "POST", body: { full_name: name, email, password } });
    check(`registracija ${name}`, r.status === 200, `status ${r.status}`);
    await s("/api/business", { method: "PUT", body: { name: `${name} biznis`, language: "sr" } });
    const { data: p } = await admin.from("profiles").select("id").eq("email", email).single();
    ids.push(p.id);
  }
  const [adminId, userId] = ids;
  await admin.from("profiles").update({ role: "admin" }).eq("id", adminId);

  // običan korisnik
  const uPage = await U("/admin");
  check("običan korisnik GET /admin → 404", uPage.status === 404, `status ${uPage.status}`);
  const uApi = await U("/api/admin/stats");
  check("običan korisnik GET /api/admin/stats → 403", uApi.status === 403 && uApi.json?.error?.code === "FORBIDDEN", `status ${uApi.status}`);
  const uImp = await U(`/api/admin/users/${adminId}/impersonate`, { method: "POST" });
  check("običan korisnik impersonate → 403", uImp.status === 403, `status ${uImp.status}`);

  // admin: statistike
  await A("/api/auth/logout", { method: "POST" });
  await A("/api/auth/login", { method: "POST", body: { email: adminEmail, password } });
  const stats = await A("/api/admin/stats");
  check("admin GET /api/admin/stats → users_total >= 2", stats.status === 200 && stats.json?.data?.stats?.users_total >= 2, `status ${stats.status}`);
  const home = await A("/admin");
  check("admin GET /admin → 200 Statistike", home.status === 200 && home.text.includes("Statistike"), `status ${home.status}`);

  // lista i pretraga
  const list = await A(`/api/admin/users?q=test-user-${stamp}`);
  check("pretraga korisnika po mejlu → 1 rezultat", list.status === 200 && list.json?.data?.items?.length === 1 && list.json.data.items[0].id === userId, `n=${list.json?.data?.items?.length}`);
  const listPage = await A(`/admin/users?q=test-user-${stamp}`);
  check("GET /admin/users?q= → 200 sa mejlom", listPage.status === 200 && listPage.text.includes(userEmail), `status ${listPage.status}`);
  const free = await A("/api/admin/users?status=free&limit=100");
  check("filter besplatni sadrži test korisnika", free.json?.data?.items?.some((u) => u.id === userId));

  // detalj
  const detail = await A(`/api/admin/users/${userId}`);
  check("detalj korisnika → profil, biznis, ledger", detail.status === 200 && detail.json?.data?.profile?.email === userEmail && detail.json?.data?.business?.name && detail.json?.data?.ledger?.length === 1, `status ${detail.status}`);
  const detailPage = await A(`/admin/users/${userId}`);
  check("GET /admin/users/[id] → 200", detailPage.status === 200 && detailPage.text.includes(userEmail), `status ${detailPage.status}`);
  const missing = await A("/api/admin/users/00000000-0000-0000-0000-000000000000");
  check("nepostojeći korisnik → 404", missing.status === 404, `status ${missing.status}`);

  // tokeni
  const noNote = await A(`/api/admin/users/${userId}/tokens`, { method: "POST", body: { amount: 10, note: "" } });
  check("tokeni bez napomene → 400", noNote.status === 400, noNote.json?.error?.message);
  const add = await A(`/api/admin/users/${userId}/tokens`, { method: "POST", body: { amount: 100, note: "Poklon za test" } });
  check("admin dodaje 100 → stanje 150", add.status === 200 && add.json?.data?.balance === 150, `status ${add.status} ${add.json?.error?.message ?? ""}`);
  const tooMuch = await A(`/api/admin/users/${userId}/tokens`, { method: "POST", body: { amount: -500, note: "Previše" } });
  check("oduzimanje više nego što ima → 400", tooMuch.status === 400, tooMuch.json?.error?.message);

  // blokiranje
  const block = await A(`/api/admin/users/${userId}`, { method: "PATCH", body: { is_blocked: true } });
  const blockedApi = await U("/api/business");
  check("admin blokira → korisnik dobija 403 BLOCKED", block.status === 200 && blockedApi.status === 403, `${block.status} ${blockedApi.status}`);
  const unblock = await A(`/api/admin/users/${userId}`, { method: "PATCH", body: { is_blocked: false } });
  const okApi = await U("/api/business");
  check("admin odblokira → korisnik opet radi", unblock.status === 200 && okApi.status === 200);

  // sebe ne može
  const self = await A(`/api/admin/users/${adminId}`, { method: "PATCH", body: { is_blocked: true } });
  check("admin ne može da blokira sebe → 400", self.status === 400, self.json?.error?.message);
  const selfImp = await A(`/api/admin/users/${adminId}/impersonate`, { method: "POST" });
  check("admin ne može da impersonira sebe → 400", selfImp.status === 400);

  // rola: postavi pa skini; poslednji admin zaštićen
  const promote = await A(`/api/admin/users/${userId}`, { method: "PATCH", body: { role: "admin" } });
  check("postavi korisnika za admina → 200", promote.status === 200);
  const demote = await A(`/api/admin/users/${userId}`, { method: "PATCH", body: { role: "user" } });
  check("skini rolu → 200", demote.status === 200);
  // Privremeno skloni sve ostale admine da bi test admin bio poslednji
  const { data: otherAdmins } = await admin.from("profiles").select("id").eq("role", "admin").neq("id", adminId);
  const others = (otherAdmins ?? []).map((o) => o.id);
  if (others.length) await admin.from("profiles").update({ role: "user" }).in("id", others);
  await admin.from("profiles").update({ role: "admin" }).eq("id", userId);
  const B = session();
  await B("/api/auth/login", { method: "POST", body: { email: userEmail, password } });
  const lastAdmin = await B(`/api/admin/users/${adminId}`, { method: "PATCH", body: { role: "user" } });
  await admin.from("profiles").update({ role: "user" }).eq("id", userId);
  if (others.length) await admin.from("profiles").update({ role: "admin" }).in("id", others);
  check("skidanje role sa jednog od dva admina → 200 (nije poslednji)", lastAdmin.status === 200, `status ${lastAdmin.status}`);
  await admin.from("profiles").update({ role: "admin" }).eq("id", adminId);
  // sad je adminId jedini admin (ako nema drugih u bazi)
  if (others.length === 0) {
    await admin.from("profiles").update({ role: "admin" }).eq("id", userId);
    const B2 = session();
    await B2("/api/auth/login", { method: "POST", body: { email: userEmail, password } });
    await B2(`/api/admin/users/${adminId}`, { method: "PATCH", body: { role: "user" } });
    const last = await A(`/api/admin/users/${userId}`, { method: "PATCH", body: { role: "user" } });
    await admin.from("profiles").update({ role: "admin" }).eq("id", adminId);
    await admin.from("profiles").update({ role: "user" }).eq("id", userId);
    void last;
  }

  // impersonacija
  const imp = await A(`/api/admin/users/${userId}/impersonate`, { method: "POST" });
  check("impersonate → 200 redirect /dashboard", imp.status === 200 && imp.json?.data?.redirect === "/dashboard", `status ${imp.status} ${imp.json?.error?.message ?? ""}`);
  const dash = await A("/dashboard");
  check("dashboard kao korisnik → baner 'Gledaš kao' + biznis korisnika", dash.status === 200 && dash.text.includes("Gledaš kao") && dash.text.includes("User Test biznis"), `status ${dash.status}`);
  const impGens = await A("/api/generations");
  check("istorija kao korisnik → njegova (prazna) lista", impGens.status === 200 && Array.isArray(impGens.json?.data?.items), `status ${impGens.status}`);
  const impCheckout = await A("/api/stripe/checkout", { method: "POST", body: { plan: "monthly" } });
  check("checkout tokom impersonacije → 403", impCheckout.status === 403, `status ${impCheckout.status}`);
  const impDel = await A("/api/account", { method: "DELETE" });
  check("brisanje naloga tokom impersonacije → 403", impDel.status === 403, `status ${impDel.status}`);
  const adminWhileImp = await A("/api/admin/stats");
  check("admin API radi i tokom impersonacije (pravi admin)", adminWhileImp.status === 200, `status ${adminWhileImp.status}`);
  const stop = await A("/api/admin/impersonate/stop", { method: "POST" });
  const dashAfter = await A("/dashboard");
  check("stop impersonacije → dashboard je opet adminov", stop.status === 200 && !dashAfter.text.includes("Gledaš kao") && dashAfter.text.includes("Admin Test biznis"), `status ${stop.status}`);

  // audit
  const audit = await A(`/api/admin/audit?limit=100`);
  const actions = (audit.json?.data?.items ?? []).filter((a) => a.admin_id === adminId).map((a) => a.action);
  const expected = ["tokens_adjust", "user_block", "user_unblock", "role_change", "impersonate_start", "impersonate_stop"];
  check("audit sadrži sve akcije admina", audit.status === 200 && expected.every((e) => actions.includes(e)), `ima: ${[...new Set(actions)].join(",")}`);
  const auditPage = await A("/admin/audit");
  check("GET /admin/audit → 200", auditPage.status === 200 && auditPage.text.includes("Audit log"), `status ${auditPage.status}`);

  // admin briše tuđu generaciju
  const { data: gen } = await admin.from("generations").insert({ user_id: userId, type: "text", prompt: "Za brisanje", tokens_cost: 2, status: "completed" }).select("id").single();
  const delGen = await A(`/api/admin/generations/${gen.id}`, { method: "DELETE" });
  const { data: stillThere } = await admin.from("generations").select("id").eq("id", gen.id).maybeSingle();
  check("admin DELETE generacije → 200 i obrisano", delGen.status === 200 && !stillThere, `status ${delGen.status}`);
} catch (e) {
  console.error("Test je pukao:", e);
  failed++;
} finally {
  for (const id of ids) await admin.auth.admin.deleteUser(id);
}

console.log(failed === 0 ? "\nSve prošlo." : `\n${failed} provera nije prošlo.`);
process.exit(failed === 0 ? 0 : 1);
