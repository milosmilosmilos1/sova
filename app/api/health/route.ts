import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Javna provera: da li aplikacija i baza odgovaraju. Bez detalja koji odaju konfiguraciju.
export async function GET() {
  const started = Date.now();
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("profiles").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true, db: "ok", ms: Date.now() - started });
  } catch (e) {
    console.error("[health]", e);
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
