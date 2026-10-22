import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, ERROR_MESSAGES, type ApiResponse, type ErrorCode } from "@/lib/errors";

// Omotač za route handler-e: hvata greške i vraća uvek isti oblik odgovora.
//   { ok: true, data }   ili   { ok: false, error: { code, message } }

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiResponse<T>>({ ok: true, data }, init);
}

export function fail(code: ErrorCode, message?: string, details?: unknown) {
  const err = new AppError(code, message, details);
  return NextResponse.json<ApiResponse<never>>(
    { ok: false, error: { code: err.code, message: err.message, details: err.details } },
    { status: err.status },
  );
}

type Handler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<Response>;

export function withApi<Ctx = unknown>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        requireSameOrigin(req);
      }
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof AppError) {
        return fail(e.code, e.message, e.details);
      }
      if (e instanceof ZodError) {
        return fail("VALIDATION_ERROR", firstIssue(e), e.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
      }
      if (e instanceof SyntaxError) {
        return fail("VALIDATION_ERROR", "Telo zahteva nije ispravan JSON.");
      }
      console.error(`[api] ${req.method} ${req.nextUrl.pathname}:`, e);
      return fail("INTERNAL");
    }
  };
}

function firstIssue(e: ZodError) {
  const i = e.issues[0];
  if (!i) return ERROR_MESSAGES.VALIDATION_ERROR;
  const path = i.path.length ? `${i.path.join(".")}: ` : "";
  return `${path}${i.message}`;
}

/** Čita i validira JSON telo. Odbija pogrešan Content-Type. */
export async function readJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw new AppError("VALIDATION_ERROR", "Očekujem application/json.");
  }
  const raw = await req.json();
  return schema.parse(raw);
}

/** Validira query parametre. */
export function readQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const obj: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    obj[k] = v;
  });
  return schema.parse(obj);
}

/** Zaštita od CSRF-a za mutacije: ako browser pošalje Origin, mora biti naš. */
export function requireSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const allowed = new Set<string>();
  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      allowed.add(new URL(process.env.NEXT_PUBLIC_APP_URL).host);
    } catch {
      // zanemari pogrešan env
    }
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) allowed.add(host);
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("FORBIDDEN", "Neispravan Origin.");
  }
  if (!allowed.has(originHost)) {
    throw new AppError("FORBIDDEN", "Zahtev nije došao sa naše strane.");
  }
}

export function clientIp(req: NextRequest) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "0.0.0.0";
}

export function userAgent(req: NextRequest) {
  return (req.headers.get("user-agent") ?? "").slice(0, 300);
}
