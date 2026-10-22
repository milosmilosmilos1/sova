import type { NextRequest } from "next/server";
import { withApi, ok, readQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { listGenerationsSchema } from "@/lib/validation/generate";
import { AppError } from "@/lib/errors";
import { signedUrls } from "@/lib/storage";
import type { GenerationDTO, GenerationRow } from "@/lib/generation";

// GET /api/generations?cursor=&type=&limit= — kursor paginacija po created_at.
export const GET = withApi(async (req: NextRequest) => {
  const user = await requireUser();
  const q = readQuery(req, listGenerationsSchema);
  const supabase = await createClient();

  let query = supabase
    .from("generations")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(q.limit + 1);
  if (q.type) query = query.eq("type", q.type);
  if (q.cursor) query = query.lt("created_at", q.cursor);

  const { data, error } = await query;
  if (error) {
    console.error("[generations] list", error.message);
    throw new AppError("INTERNAL");
  }

  const rows = data ?? [];
  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;

  // Potpisani URL-ovi u dva poziva (ne po redu).
  const inputMap = await signedUrls("uploads", page.map((r) => r.input_image_path).filter((p): p is string => Boolean(p)));
  const outputMap = await signedUrls("generated", page.map((r) => r.output_image_path).filter((p): p is string => Boolean(p)));

  const items: GenerationDTO[] = page.map((row: GenerationRow) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      type: row.type as GenerationDTO["type"],
      status: row.status,
      prompt: row.prompt,
      platform: row.platform,
      tone: row.tone,
      input_image_url: row.input_image_path ? (inputMap.get(row.input_image_path) ?? null) : null,
      output_text: row.output_text,
      output_image_url: row.output_image_path ? (outputMap.get(row.output_image_path) ?? null) : null,
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
  });

  return ok({
    items,
    nextCursor: hasMore ? page[page.length - 1].created_at : null,
  });
});
