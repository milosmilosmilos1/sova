import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { toDTO } from "@/lib/generation";
import { GenerationView } from "@/components/generation/generation-view";
import { TYPE_LABELS, STATUS_LABELS, PLATFORM_LABELS, statusBadge } from "@/components/generation/labels";

export default async function GenerationPage(props: PageProps<"/history/[id]">) {
  const user = (await getCurrentUser())!;
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("generations").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!data) notFound();
  const g = await toDTO(data);

  return (
    <div className="space-y-6">
      <Link href="/history" className="text-sm text-brand-700 hover:underline">
        ← Istorija
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title">{TYPE_LABELS[g.type]}</h1>
        <span className={statusBadge(g.status)}>{STATUS_LABELS[g.status]}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="card card-pad">
          <GenerationView g={g} />
        </div>
        <dl className="card card-pad space-y-3 text-sm">
          <div>
            <dt className="text-xs text-ink-500">Zahtev</dt>
            <dd className="whitespace-pre-wrap text-ink-900">{g.prompt}</dd>
          </div>
          {g.platform && (
            <div>
              <dt className="text-xs text-ink-500">Mreža</dt>
              <dd>{PLATFORM_LABELS[g.platform as keyof typeof PLATFORM_LABELS] ?? g.platform}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-ink-500">Tokeni</dt>
            <dd>{g.status === "completed" ? g.tokens_cost : `0 (${g.tokens_cost} vraćeno)`}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Model</dt>
            <dd className="truncate">{g.model ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Vreme</dt>
            <dd>{new Date(g.created_at).toLocaleString("sr-RS")}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
