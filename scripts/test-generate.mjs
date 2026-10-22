// Test generisanja kroz HTTP: upload, tekst (pravi Gemini poziv), slika
// (pravi poziv, ~1 min, košta par centi), tokeni, idempotency, rate limit,
// istorija, brisanje. Pravi i briše test korisnika.
//
// Pokretanje:  node --env-file=.env.local scripts/test-generate.mjs [--no-image]

import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").replace(/\/$/, "");
const SKIP_IMAGE = process.argv.includes("--no-image");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failed++;
}

const jar = new Map();
function storeCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair, ...attrs] = c.split(";");
    const i = pair.indexOf("=");
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    const maxAge = attrs.find((a) => a.trim().toLowerCase().startsWith("max-age="));
    if (value === "" || (maxAge && Number(maxAge.split("=")[1]) <= 0)) jar.delete(name);
    else jar.set(name, value);
  }
}
async function call(path, { method = "GET", body, formData } = {}) {
  const res = await fetch(BASE + path, {
    method,
    redirect: "manual",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      Origin: BASE,
      Cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
    },
    body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  storeCookies(res);
  const text = (await res.text()).replace(/<!--\s*-->/g, "");
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // HTML
  }
  return { status: res.status, json, text };
}

// 1×1 PNG i mali "GIF" (pogrešan format) za testove
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

async function makePng(size) {
  // Sastavi veću sliku kroz sharp iz node_modules projekta.
  const sharp = (await import("sharp")).default;
  return sharp({ create: { width: size, height: size, channels: 3, background: { r: 200, g: 120, b: 40 } } }).png().toBuffer();
}

const email = `test-gen-${Date.now()}@sova.local`;
const password = "Lozinka123!";
let userId = null;

try {
  const reg = await call("/api/auth/register", { method: "POST", body: { full_name: "Test Gen", email, password } });
  check("registracija", reg.status === 200, `status ${reg.status}`);
  userId = (await admin.from("profiles").select("id").eq("email", email).single()).data?.id;

  const biz = await call("/api/business", {
    method: "PUT",
    body: { name: "Pekara Test", industry: "pekara", description: "Domaći hleb i peciva, od 6 ujutru.", tone_of_voice: "prijateljski", language: "sr", default_hashtags: ["pekara", "beograd"] },
  });
  check("onboarding", biz.status === 200, `status ${biz.status}`);

  // Upload: pogrešan format, premala slika, dobra slika
  const fdGif = new FormData();
  fdGif.append("file", new Blob([GIF], { type: "image/gif" }), "x.gif");
  const upGif = await call("/api/uploads", { method: "POST", formData: fdGif });
  check("upload gif → 415 UNSUPPORTED_FORMAT", upGif.status === 415, `status ${upGif.status} ${upGif.json?.error?.code}`);

  const fdFake = new FormData();
  fdFake.append("file", new Blob([GIF], { type: "image/jpeg" }), "lazni.jpg");
  const upFake = await call("/api/uploads", { method: "POST", formData: fdFake });
  check("gif preimenovan u .jpg → 415 (provera po bajtovima)", upFake.status === 415, `status ${upFake.status}`);

  const fdTiny = new FormData();
  fdTiny.append("file", new Blob([PNG], { type: "image/png" }), "tiny.png");
  const upTiny = await call("/api/uploads", { method: "POST", formData: fdTiny });
  check("slika 1×1 → 400 premala", upTiny.status === 400, `status ${upTiny.status}`);

  const noFile = await call("/api/uploads", { method: "POST", formData: new FormData() });
  check("upload bez fajla → 400", noFile.status === 400, `status ${noFile.status}`);

  const big = await makePng(3000);
  const fdOk = new FormData();
  fdOk.append("file", new Blob([big], { type: "image/png" }), "velika.png");
  const upOk = await call("/api/uploads", { method: "POST", formData: fdOk });
  check("upload 3000px png → 200, smanjeno na 2048, putanja {uid}/…jpg", upOk.status === 200 && upOk.json?.data?.width === 2048 && upOk.json?.data?.path?.startsWith(userId + "/"), `status ${upOk.status} w=${upOk.json?.data?.width}`);
  const uploadedPath = upOk.json?.data?.path;

  // Validacija generate rute
  const emptyPrompt = await call("/api/generate/text", { method: "POST", body: { prompt: "", idempotency_key: "k-" + Date.now() } });
  check("generate/text prazan prompt → 400", emptyPrompt.status === 400, emptyPrompt.json?.error?.message);

  const longPrompt = await call("/api/generate/text", { method: "POST", body: { prompt: "a".repeat(1001), idempotency_key: "k-" + Date.now() } });
  check("generate/text 1001 znak → 400", longPrompt.status === 400, longPrompt.json?.error?.message);

  const foreignPath = await call("/api/generate/photo", {
    method: "POST",
    body: { prompt: "test slike", input_image_path: "00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000.jpg", idempotency_key: "k-" + Date.now() },
  });
  check("generate/photo sa tuđom putanjom → 403", foreignPath.status === 403, `status ${foreignPath.status} ${foreignPath.json?.error?.code}`);

  // Pravi tekst
  const key1 = "k-" + Date.now();
  const t0 = Date.now();
  const txt = await call("/api/generate/text", {
    method: "POST",
    body: { prompt: "Od ponedeljka nova zimska ponuda: topla pogača sa sirom i čaj od nane.", platform: "instagram", idempotency_key: key1 },
  });
  const g = txt.json?.data?.generation;
  check("generate/text → 200, completed, ima caption i hashtag-ove", txt.status === 200 && g?.status === "completed" && g?.output_text?.length > 10 && g?.hashtags?.length > 0, `status ${txt.status} ${Date.now() - t0} ms model=${g?.model} ${txt.json?.error?.message ?? ""}`);
  if (g?.output_text) console.log("      caption:", g.output_text.slice(0, 120).replace(/\n/g, " "), "| #" + g.hashtags.slice(0, 4).join(" #"));

  let balance = (await admin.from("profiles").select("token_balance").eq("id", userId).single()).data?.token_balance;
  check("tokeni posle teksta: 48", balance === 48, `stanje=${balance}`);

  const same = await call("/api/generate/text", { method: "POST", body: { prompt: "Bilo šta", idempotency_key: key1 } });
  check("isti idempotency_key → isti rezultat bez novog troška", same.status === 200 && same.json?.data?.generation?.id === g?.id, `status ${same.status}`);
  balance = (await admin.from("profiles").select("token_balance").eq("id", userId).single()).data?.token_balance;
  check("tokeni i dalje 48", balance === 48, `stanje=${balance}`);

  // Tekst uz fotografiju
  const txt2 = await call("/api/generate/text", {
    method: "POST",
    body: { prompt: "Objava uz ovu fotografiju proizvoda.", platform: "facebook", input_image_path: uploadedPath, idempotency_key: "k2-" + Date.now() },
  });
  check("generate/text sa fotografijom → 200 completed", txt2.status === 200 && txt2.json?.data?.generation?.status === "completed" && txt2.json?.data?.generation?.input_image_url, `status ${txt2.status} ${txt2.json?.error?.message ?? ""}`);

  // Slika iz opisa (pravi poziv)
  let imgGen = null;
  if (!SKIP_IMAGE) {
    const t1 = Date.now();
    const img = await call("/api/generate/image", {
      method: "POST",
      body: { prompt: "Sveže pecivo na drvenoj dasci u pekari, jutarnje svetlo.", aspect_ratio: "1:1", idempotency_key: "k3-" + Date.now() },
    });
    imgGen = img.json?.data?.generation;
    check("generate/image → 200 completed sa URL-om slike", img.status === 200 && imgGen?.status === "completed" && imgGen?.output_image_url, `status ${img.status} ${Math.round((Date.now() - t1) / 1000)} s model=${imgGen?.model} ${img.json?.error?.message ?? ""}`);
    if (imgGen?.output_image_url) {
      const head = await fetch(imgGen.output_image_url);
      check("potpisani URL slike vraća sliku", head.status === 200 && (head.headers.get("content-type") ?? "").startsWith("image/"), `${head.status} ${head.headers.get("content-type")}`);
    }
    balance = (await admin.from("profiles").select("token_balance").eq("id", userId).single()).data?.token_balance;
    check("tokeni posle slike: 38", balance === 38, `stanje=${balance}`);
  } else {
    console.log("      (slika preskočena: --no-image)");
  }

  // Istorija
  const list = await call("/api/generations?limit=10");
  const expected = SKIP_IMAGE ? 2 : 3;
  check(`GET /api/generations → ${expected} stavke`, list.status === 200 && list.json?.data?.items?.length === expected, `status ${list.status} n=${list.json?.data?.items?.length}`);

  const listText = await call("/api/generations?type=text");
  check("filter type=text → 2", listText.json?.data?.items?.length === 2, `n=${listText.json?.data?.items?.length}`);

  const one = await call(`/api/generations/${g.id}`);
  check("GET /api/generations/[id] → 200", one.status === 200 && one.json?.data?.generation?.id === g.id, `status ${one.status}`);

  const badId = await call("/api/generations/nije-uuid");
  check("GET /api/generations/nije-uuid → 400", badId.status === 400, `status ${badId.status}`);

  const histPage = await call("/history");
  check("GET /history → 200 sa stavkama", histPage.status === 200 && histPage.text.includes("Pekara") === false && histPage.text.includes("pogača"), `status ${histPage.status}`);

  const statsPage = await call("/stats");
  check("GET /stats → 200", statsPage.status === 200 && statsPage.text.includes("Statistike"), `status ${statsPage.status}`);

  const stats = await call("/api/stats");
  check("GET /api/stats → totals.text = 2", stats.status === 200 && stats.json?.data?.stats?.totals?.text === 2, `status ${stats.status} text=${stats.json?.data?.stats?.totals?.text}`);

  const tokens = await call("/api/tokens");
  check("GET /api/tokens → ledger sa welcome i spend", tokens.status === 200 && tokens.json?.data?.transactions?.some((t) => t.type === "welcome") && tokens.json?.data?.transactions?.some((t) => t.type === "spend"), `status ${tokens.status}`);

  // Nema dovoljno tokena → 402, bez AI poziva, stanje nepromenjeno
  await admin.from("profiles").update({ token_balance: 1 }).eq("id", userId);
  const poor = await call("/api/generate/text", { method: "POST", body: { prompt: "Nešto za objavu danas", idempotency_key: "k4-" + Date.now() } });
  check("sa 1 tokenom generate/text → 402 INSUFFICIENT_TOKENS", poor.status === 402 && poor.json?.error?.code === "INSUFFICIENT_TOKENS", `status ${poor.status} ${poor.json?.error?.message}`);
  balance = (await admin.from("profiles").select("token_balance").eq("id", userId).single()).data?.token_balance;
  check("stanje ostaje 1", balance === 1, `stanje=${balance}`);
  const failedRows = (await admin.from("generations").select("id, status, error_code").eq("user_id", userId).eq("status", "failed")).data;
  check("neuspeli pokušaj zabeležen kao failed/INSUFFICIENT_TOKENS", failedRows?.length === 1 && failedRows[0].error_code === "INSUFFICIENT_TOKENS", `n=${failedRows?.length}`);

  // Rate limit: 10 u minutu; već smo potrošili nekoliko, šaljemo do 429
  let got429 = false;
  for (let i = 0; i < 12; i++) {
    const r = await call("/api/generate/text", { method: "POST", body: { prompt: "Rate limit test", idempotency_key: `rl-${Date.now()}-${i}` } });
    if (r.status === 429) {
      got429 = true;
      break;
    }
  }
  check("posle 10 zahteva u minutu → 429 RATE_LIMITED", got429);

  // Brisanje
  const del = await call(`/api/generations/${g.id}`, { method: "DELETE" });
  check("DELETE /api/generations/[id] → 200", del.status === 200, `status ${del.status}`);
  const delAgain = await call(`/api/generations/${g.id}`, { method: "DELETE" });
  check("DELETE ponovo → 404", delAgain.status === 404, `status ${delAgain.status}`);
  if (imgGen) {
    const delImg = await call(`/api/generations/${imgGen.id}`, { method: "DELETE" });
    const { data: files } = await admin.storage.from("generated").list(userId);
    check("DELETE slike briše i fajl iz storage-a", delImg.status === 200 && (files?.length ?? 0) === 0, `status ${delImg.status} fajlova=${files?.length}`);
  }
} catch (e) {
  console.error("Test je pukao:", e);
  failed++;
} finally {
  if (userId) {
    for (const b of ["uploads", "generated"]) {
      const { data: files } = await admin.storage.from(b).list(userId);
      if (files?.length) await admin.storage.from(b).remove(files.map((f) => `${userId}/${f.name}`));
    }
    await admin.auth.admin.deleteUser(userId);
  }
}

console.log(failed === 0 ? "\nSve prošlo." : `\n${failed} provera nije prošlo.`);
process.exit(failed === 0 ? 0 : 1);
