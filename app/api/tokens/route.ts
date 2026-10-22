import { withApi, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { TOKEN_COST } from "@/lib/tokens";

// GET /api/tokens — stanje + poslednjih 50 stavki ledgera.
export const GET = withApi(async () => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("token_transactions")
    .select("id, amount, balance_after, type, status, note, generation_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("[tokens] ledger", error.message);
    throw new AppError("INTERNAL");
  }
  return ok({ balance: user.profile.token_balance, costs: TOKEN_COST, transactions: data ?? [] });
});
