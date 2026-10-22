// Postavlja rolu admin korisniku po mejlu. Radi sa service role ključem,
// pa prolazi trigger koji brani promenu role iz aplikacije.
// Pokretanje:  node --env-file=.env.local scripts/make-admin.mjs mejl@domen.rs

import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Upotreba: node --env-file=.env.local scripts/make-admin.mjs mejl@domen.rs");
  process.exit(1);
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await admin
  .from("profiles")
  .update({ role: "admin" })
  .eq("email", email)
  .select("id, email, role");

if (error) {
  console.error("Greška:", error.message);
  process.exit(1);
}
if (!data || data.length === 0) {
  console.error(`Nema korisnika sa mejlom ${email}. Prvo se registruj u aplikaciji.`);
  process.exit(1);
}
console.log(`${data[0].email} je sada admin.`);
