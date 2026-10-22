import { cookies } from "next/headers";
import { withApi, ok } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { IMPERSONATION_COOKIE } from "@/lib/auth/impersonation";

export const POST = withApi(async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Ako je admin bio u impersonaciji, i to se gasi.
  const store = await cookies();
  store.delete(IMPERSONATION_COOKIE);
  return ok({ redirect: "/login" });
});
