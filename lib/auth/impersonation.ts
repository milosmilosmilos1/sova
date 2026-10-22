import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

// Impersonacija: admin "gleda kao" korisnik. Potpisan httpOnly cookie nosi
// {admin_id, user_id, exp}. Validan je samo ako je i trenutna sesija zaista
// admin (proverava get-user.ts), pa ukraden cookie bez admin sesije ne vredi.
// Vidi PLAN.md 7.3.

export const IMPERSONATION_COOKIE = "sova_imp";
const TTL_SECONDS = 60 * 60;

export type ImpersonationPayload = { admin_id: string; user_id: string; exp: number };

function sign(data: string) {
  const secret = env.IMPERSONATION_SECRET;
  if (!secret) throw new Error("IMPERSONATION_SECRET nije podešen");
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function isImpersonationConfigured() {
  return Boolean(env.IMPERSONATION_SECRET);
}

export function createImpersonationToken(adminId: string, userId: string) {
  const payload: ImpersonationPayload = {
    admin_id: adminId,
    user_id: userId,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${data}.${sign(data)}`, maxAge: TTL_SECONDS };
}

export function verifyImpersonationToken(token: string): ImpersonationPayload | null {
  if (!isImpersonationConfigured()) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = sign(data);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as ImpersonationPayload;
    if (!payload.admin_id || !payload.user_id || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function readImpersonation(): Promise<ImpersonationPayload | null> {
  const store = await cookies();
  const raw = store.get(IMPERSONATION_COOKIE)?.value;
  if (!raw) return null;
  return verifyImpersonationToken(raw);
}
