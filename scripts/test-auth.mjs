// Test auth toka kroz HTTP, protiv dev servera (podrazumevano localhost:3001).
// Registracija → onboarding → dashboard → odjava → prijava → greške.
// Briše test korisnika na kraju.
//
// Pokretanje:  node --env-file=.env.local scripts/test-auth.mjs [http://localhost:3001]

import { createClient } from "@supabase/supabase-js";

const BASE = (process.argv[2] ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").replace(/\/$/, "");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failed++;
}

// Mali cookie jar, jer fetch u Node-u ne čuva cookie-je.
const jar = new Map();
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
function storeCookies(res) {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [pair, ...attrs] = c.split(";");
    const idx = pair.indexOf("=");
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    const maxAge = attrs.find((a) => a.trim().toLowerCase().startsWith("max-age="));
    if (value === "" || (maxAge && Number(maxAge.split("=")[1]) <= 0)) jar.delete(name);
    else jar.set(name, value);
  }
}
async function call(path, { method = "GET", body, headers = {}, raw = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    redirect: "manual",
    headers: {
      ...(body !== undefined && !raw ? { "Content-Type": "application/json" } : {}),
      Origin: BASE,
      Cookie: cookieHeader(),
      ...headers,
    },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  storeCookies(res);
  // React ubacuje <!-- --> između susednih tekstova, pa ga sklanjamo za provere.
  const text = (await res.text()).replace(/<!--\s*-->/g, "");
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // HTML ili prazno
  }
  return { status: res.status, json, text, location: res.headers.get("location") };
}

const email = `test-auth-${Date.now()}@sova.local`;
const password = "Lozinka123!";

try {
  const h = await call("/api/health");
  check("GET /api/health → ok", h.status === 200 && h.json?.ok === true, `status ${h.status}`);

  const noAuth = await call("/api/business");
  check("GET /api/business bez prijave → 401", noAuth.status === 401 && noAuth.json?.error?.code === "UNAUTHORIZED", `status ${noAuth.status}`);

  const page = await call("/dashboard");
  check("GET /dashboard bez prijave → redirect na /login?next=", page.status >= 300 && page.status < 400 && /\/login\?next=%2Fdashboard/.test(page.location ?? ""), `${page.status} ${page.location}`);

  const badJson = await call("/api/auth/register", { method: "POST", body: "{nije json", raw: true, headers: { "Content-Type": "application/json" } });
  check("POST loš JSON → 400 VALIDATION_ERROR", badJson.status === 400 && badJson.json?.error?.code === "VALIDATION_ERROR", `status ${badJson.status}`);

  const weak = await call("/api/auth/register", { method: "POST", body: { full_name: "T", email: "nije-mejl", password: "123" } });
  check("registracija sa lošim podacima → 400 sa porukom", weak.status === 400 && typeof weak.json?.error?.message === "string", weak.json?.error?.message);

  const csrf = await call("/api/auth/register", { method: "POST", body: { full_name: "Test", email, password }, headers: { Origin: "https://zli-sajt.example" } });
  check("POST sa tuđim Origin → 403", csrf.status === 403, `status ${csrf.status}`);

  const reg = await call("/api/auth/register", { method: "POST", body: { full_name: "Test Auth", email, password } });
  check("registracija → 200, redirect /onboarding, cookie sesije", reg.status === 200 && reg.json?.data?.redirect === "/onboarding" && jar.size > 0, `status ${reg.status} cookies=${jar.size}`);

  const dup = await call("/api/auth/register", { method: "POST", body: { full_name: "Test Auth", email, password } });
  check("ista registracija ponovo → 409 CONFLICT", dup.status === 409 && dup.json?.error?.code === "CONFLICT", `status ${dup.status} ${dup.json?.error?.code}`);

  const dashBefore = await call("/dashboard");
  check("GET /dashboard pre onboarding-a → redirect na /onboarding", dashBefore.status >= 300 && dashBefore.status < 400 && /\/onboarding/.test(dashBefore.location ?? ""), `${dashBefore.status} ${dashBefore.location}`);

  const biz0 = await call("/api/business");
  check("GET /api/business → business: null", biz0.status === 200 && biz0.json?.data?.business === null, `status ${biz0.status}`);

  const bizBad = await call("/api/business", { method: "PUT", body: { name: "", brand_colors: ["crvena"] } });
  check("PUT /api/business sa praznim imenom → 400", bizBad.status === 400, bizBad.json?.error?.message);

  const biz = await call("/api/business", {
    method: "PUT",
    body: { name: "Kafić Test", industry: "kafić", description: "Specialty kafa u centru.", tone_of_voice: "prijateljski", language: "sr", brand_colors: ["#1D4ED8"], default_hashtags: ["#kafa", "beograd"] },
  });
  check("PUT /api/business → 200, redirect /dashboard, hashtag bez #", biz.status === 200 && biz.json?.data?.redirect === "/dashboard" && biz.json?.data?.business?.default_hashtags?.[0] === "kafa", `status ${biz.status}`);

  const dash = await call("/dashboard");
  check("GET /dashboard posle onboarding-a → 200 sa imenom biznisa i 50 tokena", dash.status === 200 && dash.text.includes("Kafić Test") && dash.text.includes("50 tokena"), `status ${dash.status}`);

  const onb = await call("/onboarding");
  check("GET /onboarding posle onboarding-a → redirect /dashboard", onb.status >= 300 && onb.status < 400 && /\/dashboard/.test(onb.location ?? ""), `${onb.status} ${onb.location}`);

  const loginPage = await call("/login");
  check("GET /login kad si prijavljen → redirect /dashboard", loginPage.status >= 300 && loginPage.status < 400, `${loginPage.status} ${loginPage.location}`);

  const acc = await call("/api/account", { method: "PATCH", body: { full_name: "Novo Ime" } });
  check("PATCH /api/account ime → 200", acc.status === 200, acc.json?.error?.message);

  const pwWrong = await call("/api/account", { method: "PATCH", body: { current_password: "pogresna", new_password: "NovaLozinka123" } });
  check("PATCH lozinka sa pogrešnom trenutnom → 400", pwWrong.status === 400, pwWrong.json?.error?.message);

  const pwOk = await call("/api/account", { method: "PATCH", body: { current_password: password, new_password: "NovaLozinka123" } });
  check("PATCH lozinka sa tačnom trenutnom → 200", pwOk.status === 200, pwOk.json?.error?.message);

  const out = await call("/api/auth/logout", { method: "POST" });
  check("POST /api/auth/logout → 200 i cookie obrisan", out.status === 200, `status ${out.status}`);

  const afterOut = await call("/api/business");
  check("posle odjave GET /api/business → 401", afterOut.status === 401, `status ${afterOut.status}`);

  const wrong = await call("/api/auth/login", { method: "POST", body: { email, password: "pogresna123" } });
  check("prijava pogrešnom lozinkom → 401", wrong.status === 401 && wrong.json?.error?.code === "UNAUTHORIZED", `status ${wrong.status}`);

  const oldPw = await call("/api/auth/login", { method: "POST", body: { email, password } });
  check("prijava STAROM lozinkom posle promene → 401", oldPw.status === 401, `status ${oldPw.status}`);

  const login = await call("/api/auth/login", { method: "POST", body: { email, password: "NovaLozinka123" } });
  check("prijava novom lozinkom → 200, redirect /dashboard", login.status === 200 && login.json?.data?.redirect === "/dashboard", `status ${login.status}`);

  // Blokada: admin postavi is_blocked, korisnik dobija 403 i /blocked
  const { data: prof } = await admin.from("profiles").select("id").eq("email", email).single();
  await admin.from("profiles").update({ is_blocked: true }).eq("id", prof.id);
  const blockedApi = await call("/api/business");
  const blockedPage = await call("/dashboard");
  check("blokiran korisnik → API 403 BLOCKED, /dashboard → /blocked", blockedApi.status === 403 && blockedApi.json?.error?.code === "BLOCKED" && /\/blocked/.test(blockedPage.location ?? ""), `${blockedApi.status} ${blockedPage.location}`);
  const blockedHtml = await call("/blocked");
  check("GET /blocked → 200 sa porukom", blockedHtml.status === 200 && blockedHtml.text.includes("Nalog je blokiran"), `status ${blockedHtml.status}`);
  await admin.from("profiles").update({ is_blocked: false }).eq("id", prof.id);

  const forgot = await call("/api/auth/forgot-password", { method: "POST", body: { email: "ne-postoji@sova.local" } });
  check("forgot-password za nepostojeći mejl → 200 (ne otkriva)", forgot.status === 200 && forgot.json?.data?.sent === true, `status ${forgot.status}`);

  const notFound = await call("/ova-strana-ne-postoji");
  check("nepostojeća strana → 404", notFound.status === 404, `status ${notFound.status}`);
} catch (e) {
  console.error("Test je pukao:", e);
  failed++;
} finally {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (u.email?.startsWith("test-auth-")) await admin.auth.admin.deleteUser(u.id);
  }
}

console.log(failed === 0 ? "\nSve prošlo." : `\n${failed} provera nije prošlo.`);
process.exit(failed === 0 ? 0 : 1);
