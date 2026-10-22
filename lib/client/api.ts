import type { ApiResponse, ErrorCode } from "@/lib/errors";

// Fetch helper za browser. Vraća data ili baca ApiClientError sa kodom i
// porukom koju možemo da prikažemo korisniku.

export class ApiClientError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: ErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type Options = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** FormData za upload; tad se body ignoriše. */
  formData?: FormData;
  signal?: AbortSignal;
};

export async function apiFetch<T>(url: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? (opts.body || opts.formData ? "POST" : "GET");
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body, signal: opts.signal, credentials: "same-origin" });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiClientError("INTERNAL", "Nema veze sa serverom. Proveri internet pa pokušaj ponovo.", 0);
  }

  let json: ApiResponse<T> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiClientError("INTERNAL", `Server je vratio neočekivan odgovor (${res.status}).`, res.status);
  }

  if (!json.ok) {
    throw new ApiClientError(json.error.code, json.error.message, res.status, json.error.details);
  }
  return json.data;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiClientError) return e.message;
  if (e instanceof Error) return e.message;
  return "Nešto je puklo. Pokušaj ponovo.";
}
