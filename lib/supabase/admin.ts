import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Service role klijent. ZAOBILAZI RLS. Koristi se samo na serveru i samo
// gde mora: Stripe webhook, funkcije za tokene, admin akcije, upis
// generisanih fajlova. `server-only` iznad znači da build pada ako ga
// neka klijentska komponenta uveze.
export function createAdminClient() {
  return createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
