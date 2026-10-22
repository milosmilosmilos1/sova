import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

// Dnevno čišćenje (Vercel Cron, vidi vercel.json). Dve stvari:
// 1. Generisanja zaglavljena u pending/processing duže od 15 min (server pao
//    usred posla): označi failed i vrati rezervisane tokene.
// 2. Upload-i stariji od 7 dana koje nijedna generacija ne koristi.
// Zaštita: Authorization: Bearer CRON_SECRET (Vercel ga šalje sam).

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Nema pristupa." } }, { status: 401 });
  }

  const admin = createAdminClient();
  const report = { stuckFailed: 0, tokensReleased: 0, orphansRemoved: 0, errors: [] as string[] };

  // 1. zaglavljena generisanja
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: stuck } = await admin
    .from("generations")
    .select("id")
    .in("status", ["pending", "processing"])
    .lt("created_at", cutoff);
  for (const g of stuck ?? []) {
    const { data: tx } = await admin
      .from("token_transactions")
      .select("id")
      .eq("generation_id", g.id)
      .eq("status", "reserved")
      .maybeSingle();
    if (tx) {
      const { error } = await admin.rpc("release_tokens", { p_tx_id: tx.id });
      if (error) report.errors.push(`release ${tx.id}: ${error.message}`);
      else report.tokensReleased++;
    }
    const { error } = await admin
      .from("generations")
      .update({ status: "failed", error_code: "TIMEOUT", error_message: "Prekinuto: server nije završio posao", completed_at: new Date().toISOString() })
      .eq("id", g.id);
    if (error) report.errors.push(`stuck ${g.id}: ${error.message}`);
    else report.stuckFailed++;
  }

  // 2. siročići u uploads: stariji od 7 dana, nisu ni u jednoj generaciji
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: folders } = await admin.storage.from("uploads").list("", { limit: 1000 });
  for (const folder of folders ?? []) {
    if (!folder.name || folder.name.includes(".")) continue;
    const { data: files } = await admin.storage.from("uploads").list(folder.name, { limit: 1000 });
    const old = (files ?? []).filter((f) => f.created_at && f.created_at < weekAgo).map((f) => `${folder.name}/${f.name}`);
    if (old.length === 0) continue;
    const { data: used } = await admin.from("generations").select("input_image_path").in("input_image_path", old);
    const usedSet = new Set((used ?? []).map((u) => u.input_image_path));
    const orphans = old.filter((p) => !usedSet.has(p));
    if (orphans.length === 0) continue;
    const { error } = await admin.storage.from("uploads").remove(orphans);
    if (error) report.errors.push(`remove ${folder.name}: ${error.message}`);
    else report.orphansRemoved += orphans.length;
  }

  // 3. stari rate limit prozori (funkcija ih čisti nasumično; ovde sigurno)
  await admin.from("rate_limits").delete().lt("window_start", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  console.log("[cron/cleanup]", report);
  return NextResponse.json({ ok: true, data: report });
}
