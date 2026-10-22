// Jedinstven oblik greške za ceo API. Vidi PLAN.md odeljak 6.

export type ErrorCode =
  | "UNAUTHORIZED"
  | "EMAIL_NOT_CONFIRMED"
  | "BLOCKED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FORMAT"
  | "INSUFFICIENT_TOKENS"
  | "RATE_LIMITED"
  | "AI_REJECTED"
  | "AI_UNAVAILABLE"
  | "NOT_CONFIGURED"
  | "INTERNAL";

export const ERROR_STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  EMAIL_NOT_CONFIRMED: 403,
  BLOCKED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_FORMAT: 415,
  INSUFFICIENT_TOKENS: 402,
  RATE_LIMITED: 429,
  AI_REJECTED: 422,
  AI_UNAVAILABLE: 503,
  NOT_CONFIGURED: 503,
  INTERNAL: 500,
};

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHORIZED: "Nisi prijavljen. Prijavi se pa pokušaj ponovo.",
  EMAIL_NOT_CONFIRMED: "Potvrdi mejl pre prijave. Proveri sanduče.",
  BLOCKED: "Nalog je blokiran. Javi se podršci.",
  FORBIDDEN: "Nemaš pravo za ovu akciju.",
  NOT_FOUND: "Nije pronađeno.",
  VALIDATION_ERROR: "Proveri unete podatke.",
  CONFLICT: "Već postoji.",
  FILE_TOO_LARGE: "Fajl je prevelik.",
  UNSUPPORTED_FORMAT: "Format fajla nije podržan. Može jpg, png ili webp.",
  INSUFFICIENT_TOKENS: "Nemaš dovoljno tokena.",
  RATE_LIMITED: "Previše zahteva. Sačekaj minut pa pokušaj ponovo.",
  AI_REJECTED: "AI nije hteo da napravi ovo. Promeni opis pa pokušaj ponovo. Tokeni ti nisu skinuti.",
  AI_UNAVAILABLE: "AI servis trenutno ne radi. Tokeni ti nisu skinuti. Pokušaj za par minuta.",
  NOT_CONFIGURED: "Ova funkcija još nije podešena na serveru.",
  INTERNAL: "Nešto je puklo na našoj strani. Pokušaj ponovo.",
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Oblik koji API uvek vraća. */
export type ApiError = { code: ErrorCode; message: string; details?: unknown };
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };
