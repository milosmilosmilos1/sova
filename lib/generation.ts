import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/lib/auth/get-user";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { TOKEN_COST, reserveTokens, commitTokens, releaseTokens, type GenerationType } from "@/lib/tokens";
import { generateText } from "@/lib/ai/text";
import { generateImage, type AspectRatio } from "@/lib/ai/image";
import { AiError } from "@/lib/ai/retry";
import type { Platform } from "@/lib/ai/prompts";
import { assertOwnPath, buildPath, downloadBuffer, uploadBuffer, signedUrl } from "@/lib/storage";
import { normalizeGenerated } from "@/lib/images";
import type { Database } from "@/types/database";

// Zajednički tok za sve tri funkcije. Redosled iz PLAN.md 6.1:
// auth (ruta) → validacija (ruta) → rate limit → idempotency → red u bazi →
// rezerviši tokene → AI → sačuvaj → potvrdi tokene → vrati.

export type GenerationRow = Database["public"]["Tables"]["generations"]["Row"];

export type RunInput =
  | { type: "text"; prompt: string; platform: Platform; tone: string | null; inputImagePath: string | null; fromGenerationId: string | null; idempotencyKey: string }
  | { type: "image_from_prompt"; prompt: string; aspectRatio: AspectRatio; idempotencyKey: string }
  | { type: "image_from_photo"; prompt: string; aspectRatio: AspectRatio; inputImagePath: string; idempotencyKey: string };

export type GenerationDTO = {
  id: string;
  type: GenerationType;
  status: GenerationRow["status"];
  prompt: string;
  platform: string | null;
  tone: string | null;
  input_image_url: string | null;
  output_text: string | null;
  output_image_url: string | null;
  hashtags: string[];
  cta: string | null;
  tokens_cost: number;
  model: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  metadata: Record<string, unknown>;
};

export async function toDTO(row: GenerationRow): Promise<GenerationDTO> {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const [inputUrl, outputUrl] = await Promise.all([
    signedUrl("uploads", row.input_image_path),
    signedUrl("generated", row.output_image_path),
  ]);
  return {
    id: row.id,
    type: row.type as GenerationType,
    status: row.status,
    prompt: row.prompt,
    platform: row.platform,
    tone: row.tone,
    input_image_url: inputUrl,
    output_text: row.output_text,
    output_image_url: outputUrl,
    hashtags: Array.isArray(meta.hashtags) ? (meta.hashtags as string[]) : [],
    cta: typeof meta.cta === "string" ? meta.cta : null,
    tokens_cost: row.tokens_cost,
    model: row.model,
    error_code: row.error_code,
    error_message: row.error_message,
    created_at: row.created_at,
    completed_at: row.completed_at,
    metadata: meta,
  };
}

export async function runGeneration(user: CurrentUser, input: RunInput): Promise<GenerationDTO> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const cost = TOKEN_COST[input.type];

  // 3. rate limit po korisniku
  await enforceRateLimit("generate", user.id);

  // 4. idempotency: isti ključ → isti rezultat, ne radi dvaput
  const { data: existing } = await supabase
    .from("generations")
    .select("*")
    .eq("user_id", user.id)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing) {
    if (existing.status === "pending" || existing.status === "processing") {
      throw new AppError("CONFLICT", "Ovo generisanje je već u toku. Sačekaj da se završi.");
    }
    return toDTO(existing);
  }

  // Ulazna slika mora biti korisnikova i mora postojati.
  const inputImagePath = "inputImagePath" in input ? input.inputImagePath : null;
  let inputImage: { data: string; mimeType: string } | null = null;
  if (inputImagePath) {
    assertOwnPath(inputImagePath, user.id);
    const file = await downloadBuffer("uploads", inputImagePath);
    inputImage = { data: file.buffer.toString("base64"), mimeType: file.mimeType };
  }

  // Tekst za ranije generisanu sliku: uzmi je iz bucket-a generated.
  let fromGenerationId: string | null = null;
  if (input.type === "text" && input.fromGenerationId && !inputImage) {
    const { data: src } = await supabase
      .from("generations")
      .select("id, output_image_path")
      .eq("id", input.fromGenerationId)
      .eq("user_id", user.id)
      .eq("status", "completed")
      .maybeSingle();
    if (!src?.output_image_path) throw new AppError("NOT_FOUND", "Slika za koju tražiš tekst ne postoji.");
    const file = await downloadBuffer("generated", src.output_image_path);
    inputImage = { data: file.buffer.toString("base64"), mimeType: file.mimeType };
    fromGenerationId = src.id;
  }

  const { data: business } = await supabase.from("businesses").select("*").eq("user_id", user.id).maybeSingle();

  // 5. red u bazi (pending)
  const { data: row, error: insErr } = await supabase
    .from("generations")
    .insert({
      user_id: user.id,
      type: input.type,
      status: "pending",
      prompt: input.prompt,
      platform: input.type === "text" ? input.platform : null,
      tone: input.type === "text" ? input.tone : null,
      input_image_path: inputImagePath,
      tokens_cost: cost,
      provider: "gemini",
      idempotency_key: input.idempotencyKey,
      metadata: input.type === "text" ? (fromGenerationId ? { from_generation_id: fromGenerationId } : {}) : { aspect_ratio: input.aspectRatio },
    })
    .select()
    .single();
  if (insErr || !row) {
    if (insErr?.code === "23505") {
      throw new AppError("CONFLICT", "Ovo generisanje je već u toku. Sačekaj da se završi.");
    }
    console.error("[generation] insert", insErr?.message);
    throw new AppError("INTERNAL");
  }

  // 6. rezervacija tokena (atomska)
  let txId: string;
  try {
    txId = await reserveTokens(user.id, cost, row.id, user.profile.token_balance);
  } catch (e) {
    await admin
      .from("generations")
      .update({ status: "failed", error_code: "INSUFFICIENT_TOKENS", error_message: "Nema dovoljno tokena", completed_at: new Date().toISOString() })
      .eq("id", row.id);
    throw e;
  }

  // 7–9. AI → sačuvaj → potvrdi
  try {
    await admin.from("generations").update({ status: "processing" }).eq("id", row.id);

    let patch: Database["public"]["Tables"]["generations"]["Update"];

    if (input.type === "text") {
      const r = await generateText({
        business,
        prompt: input.prompt,
        platform: input.platform,
        tone: input.tone,
        language: (business?.language as "sr" | "en") ?? "sr",
        image: inputImage,
      });
      patch = {
        output_text: r.caption,
        model: r.model,
        attempts: r.attempts,
        duration_ms: r.durationMs,
        metadata: { hashtags: r.hashtags, cta: r.cta, ...(fromGenerationId ? { from_generation_id: fromGenerationId } : {}) },
      };
    } else {
      const r = await generateImage({
        business,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        inputImage,
      });
      const img = await normalizeGenerated(r.buffer);
      const path = await uploadBuffer("generated", buildPath(user.id, "jpg"), img.buffer, "image/jpeg");
      patch = {
        output_image_path: path,
        model: r.model,
        attempts: r.attempts,
        duration_ms: r.durationMs,
        metadata: { aspect_ratio: input.aspectRatio, width: img.width, height: img.height, source_mime: r.mimeType },
      };
    }

    const { data: done, error: updErr } = await admin
      .from("generations")
      .update({ ...patch, status: "completed", completed_at: new Date().toISOString() })
      .eq("id", row.id)
      .select()
      .single();
    if (updErr || !done) {
      console.error("[generation] completed update", updErr?.message);
      throw new AppError("INTERNAL");
    }

    await commitTokens(txId);
    return toDTO(done);
  } catch (e) {
    await releaseTokens(txId);
    const { code, message, publicError } = mapFailure(e);
    await admin
      .from("generations")
      .update({ status: "failed", error_code: code, error_message: message, completed_at: new Date().toISOString() })
      .eq("id", row.id);
    throw publicError;
  }
}

function mapFailure(e: unknown): { code: string; message: string; publicError: AppError } {
  if (e instanceof AiError) {
    if (e.kind === "rejected") {
      return { code: "AI_REJECTED", message: e.message, publicError: new AppError("AI_REJECTED") };
    }
    if (e.kind === "fatal" && (e.status === 401 || e.status === 403)) {
      console.error("[generation] AI ključ odbijen:", e.message);
    }
    return { code: "AI_UNAVAILABLE", message: `${e.model}: ${e.message}`, publicError: new AppError("AI_UNAVAILABLE") };
  }
  if (e instanceof AppError) {
    return { code: e.code, message: e.message, publicError: e };
  }
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[generation] neočekivano:", e);
  return { code: "INTERNAL", message: msg.slice(0, 300), publicError: new AppError("INTERNAL", "Generisanje nije uspelo. Tokeni ti nisu skinuti.") };
}
