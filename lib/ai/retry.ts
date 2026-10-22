import "server-only";
import { ApiError } from "@google/genai";

// Klasifikacija grešaka AI servisa i retry sa eksponencijalnim čekanjem.
// Vidi PLAN.md 8.3.

export type AiFailureKind =
  | "retryable" // 429, 500, 503, timeout, mreža → pokušaj ponovo
  | "rejected" // safety blok, prazan odgovor → isti ulaz bi opet pao
  | "fatal"; // loš ključ, nepostojeći model, loš zahtev → ne ponavljaj

export class AiError extends Error {
  readonly kind: AiFailureKind;
  readonly status?: number;
  readonly model: string;
  constructor(kind: AiFailureKind, message: string, model: string, status?: number) {
    super(message);
    this.name = "AiError";
    this.kind = kind;
    this.model = model;
    this.status = status;
  }
}

export function classifyError(e: unknown, model: string): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof ApiError) {
    const s = e.status;
    if (s === 429 || s === 500 || s === 502 || s === 503 || s === 504) {
      return new AiError("retryable", `Gemini ${s}: ${short(e.message)}`, model, s);
    }
    if (s === 400 && /safety|blocked|prohibited/i.test(e.message)) {
      return new AiError("rejected", short(e.message), model, s);
    }
    return new AiError("fatal", `Gemini ${s}: ${short(e.message)}`, model, s);
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/timeout|timed out|aborted|ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed|socket/i.test(msg)) {
    return new AiError("retryable", short(msg), model);
  }
  return new AiError("fatal", short(msg), model);
}

function short(s: string) {
  const m = s.match(/"message":"([^"]{0,200})/);
  return (m ? m[1] : s).slice(0, 200);
}

export type RetryOptions = {
  attempts: number;
  baseDelayMs?: number;
  label: string;
  onAttempt?: (n: number) => void;
};

/** Ponavlja samo "retryable" greške. Ostale odmah prosleđuje. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const base = opts.baseDelayMs ?? 500;
  let last: AiError | null = null;
  for (let n = 1; n <= opts.attempts; n++) {
    opts.onAttempt?.(n);
    try {
      return await fn();
    } catch (e) {
      const err = classifyError(e, opts.label);
      last = err;
      if (err.kind !== "retryable" || n === opts.attempts) throw err;
      const jitter = Math.random() * 300;
      const delay = base * 3 ** (n - 1) + jitter; // 0,5 s → 1,5 s → 4,5 s
      console.warn(`[ai] ${opts.label} pokušaj ${n} nije uspeo (${err.message}), čekam ${Math.round(delay)} ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw last ?? new AiError("fatal", "Nepoznata greška", opts.label);
}
