import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

// SAMO ZA RAZVOJ: prijava kroz GET da headless Chrome može da slika zaštićene
// strane (scripts/screenshots.mjs). U produkciji uvek 404. Traži CRON_SECRET.
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production" || !env.CRON_SECRET) {
    return new NextResponse(null, { status: 404 });
  }
  const p = req.nextUrl.searchParams;
  if (p.get("secret") !== env.CRON_SECRET) return new NextResponse(null, { status: 404 });

  const email = p.get("email") ?? "";
  const password = p.get("password") ?? "";
  const next = p.get("next") ?? "/dashboard";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 401 });

  return NextResponse.redirect(new URL(safeNext, req.nextUrl.origin));
}
