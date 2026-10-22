import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Odredište linkova iz mejla (potvrda naloga, reset lozinke). Supabase nas
// vrati sa ?code=..., mi ga menjamo za sesiju i šaljemo korisnika dalje.

function safeNext(raw: string | null, fallback: string) {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = safeNext(req.nextUrl.searchParams.get("next"), "/dashboard");
  const origin = req.nextUrl.origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth/callback]", error.message);
  }

  // Supabase ponekad vrati grešku u query-ju (istekao link).
  const errDesc = req.nextUrl.searchParams.get("error_description");
  const url = new URL("/login", origin);
  url.searchParams.set("error", errDesc ? "link_expired" : "link_invalid");
  return NextResponse.redirect(url);
}
