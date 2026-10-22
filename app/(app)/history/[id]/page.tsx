import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { toDTO } from "@/lib/generation";
import { GenerationView, TYPE_LABELS, STATUS_LABELS } from "@/components/generation/generation-view";

export default async function GenerationPage(props: PageProps<"/history/[id]">) {
  const user = (await getCurrentUser())!;
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("generations").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!data) notFound();
  const g = await toDTO(data);

  return (
    <div className="space-y-4">
      <Link href="/history" className="text-sm underline">
        ← Istorija
      </Link>
      <h1 className="text-xl font-semibold">{TYPE_LABELS[g.type]}</h1>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-gray-500">Status</dt>
        <dd>{STATUS_LABELS[g.status]}</dd>
        <dt className="text-gray-500">Zahtev</dt>
        <dd className="whitespace-pre-wrap">{g.prompt}</dd>
        {g.platform && (
          <>
            <dt className="text-gray-500">Mreža</dt>
            <dd>{g.platform}</dd>
          </>
        )}
        <dt className="text-gray-500">Tokeni</dt>
        <dd>{g.status === "completed" ? g.tokens_cost : `0 (${g.tokens_cost} vraćeno)`}</dd>
        <dt className="text-gray-500">Model</dt>
        <dd>{g.model ?? "—"}</dd>
        <dt className="text-gray-500">Vreme</dt>
        <dd>{new Date(g.created_at).toLocaleString("sr-RS")}</dd>
      </dl>
      <GenerationView g={g} />
    </div>
  );
}
