import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Radi pre svake rute: osvežava Supabase sesiju u cookie-jima i brani
// privatne strane. Onboarding, blokadu i admin rolu proveravaju layout-i i
// rute (traže čitanje profila), ovde samo "ima li sesije".

const PUBLIC_PAGES = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/check-email",
  "/terms",
  "/privacy",
]);

const PUBLIC_PREFIXES = ["/auth/", "/api/auth/register", "/api/auth/login", "/api/auth/forgot-password", "/api/stripe/webhook", "/api/health", "/api/cron/", "/api/dev/"];

function isPublic(path: string) {
  if (PUBLIC_PAGES.has(path)) return true;
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p));
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser() proverava token kod auth servera; getSession() bi verovao cookie-ju.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && !isPublic(path)) {
    if (path.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Nisi prijavljen." } },
        { status: 401 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const next = request.nextUrl.pathname + request.nextUrl.search;
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  if (user && (path === "/login" || path === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Sve osim statičkih fajlova i Next internih putanja.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
