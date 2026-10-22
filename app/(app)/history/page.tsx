import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import { HistoryList } from "@/components/generation/history-list";
import type { GenerationDTO, GenerationStatus } from "@/lib/generation";

const TYPES = [
  { value: null, label: "Sve" },
  { value: "text", label: "Tekst" },
  { value: "image_from_prompt", label: "Slika iz opisa" },
  { value: "image_from_photo", label: "Slika iz fotografije" },
] as const;

const PAGE = 20;

export default async function HistoryPage(props: PageProps<"/history">) {
  const user = (await getCurrentUser())!;
  const { type: rawType } = await props.searchParams;
  const type = TYPES.some((t) => t.value === rawType) ? (rawType as string) : null;

  const supabase = await createClient();
  let query = supabase.from("generations").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(PAGE + 1);
  if (type) query = query.eq("type", type);
  const { data, error } = await query;

  if (error) {
    return (
      <div className="space-y-2">
        <h1 className="page-title">Istorija</h1>
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Ne mogu da učitam istoriju. Osveži stranu.</p>
      </div>
    );
  }

  const rows = data ?? [];
  const hasMore = rows.length > PAGE;
  const page = hasMore ? rows.slice(0, PAGE) : rows;
  const inputMap = await signedUrls("uploads", page.map((r) => r.input_image_path).filter((p): p is string => Boolean(p)));
  const outputMap = await signedUrls("generated", page.map((r) => r.output_image_path).filter((p): p is string => Boolean(p)));

  const items: GenerationDTO[] = page.map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      type: row.type as GenerationDTO["type"],
      status: row.status as GenerationStatus,
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Istorija</h1>
        <p className="page-sub">Sve što si napravio, najnovije prvo.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <Link
            key={t.label}
            href={t.value ? `/history?type=${t.value}` : "/history"}
            className={`btn btn-sm ${type === t.value ? "btn-primary" : "btn-secondary"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <HistoryList key={type ?? "all"} initial={{ items, nextCursor: hasMore ? page[page.length - 1].created_at : null }} type={type} />
    </div>
  );
}
