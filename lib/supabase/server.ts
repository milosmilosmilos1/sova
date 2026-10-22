import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

// Klijent za server komponente i route handler-e. Radi kao ulogovani
// korisnik (sesija iz cookie-ja), pa RLS politike važe.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server komponente ne mogu da pišu cookie-je; proxy.ts
            // osvežava sesiju, pa je ovo bezopasno.
          }
        },
      },
    },
  );
}
