import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { TOKEN_COST } from "@/lib/tokens";
import { signedUrls } from "@/lib/storage";
import { TYPE_LABELS, STATUS_LABELS } from "@/components/generation/labels";

export default async function DashboardPage() {
  const user = (await getCurrentUser())!;
  const supabase = await createClient();
  const [{ data: business }, { data: recent }, { data: sub }] = await Promise.all([
    supabase.from("businesses").select("name").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("generations")
      .select("id, type, status, prompt, output_image_path, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("subscriptions").select("plan, status").eq("user_id", user.id).in("status", ["active", "trialing", "past_due"]).limit(1).maybeSingle(),
  ]);
  const thumbs = await signedUrls("generated", (recent ?? []).map((r) => r.output_image_path).filter((p): p is string => Boolean(p)));
  const firstName = (user.profile.full_name ?? "").split(" ")[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{firstName ? `Zdravo, ${firstName}` : "Zdravo"}</h1>
          <p className="page-sub">{business?.name ? `Radimo na: ${business.name}.` : "Šta pravimo danas?"}</p>
        </div>
        <div className="card flex items-center gap-4 px-4 py-3">
          <div>
            <div className="text-xs text-ink-500">Tokeni</div>
            <div className="text-xl font-semibold text-brand-700">{user.profile.token_balance}</div>
          </div>
          <div className="h-8 w-px bg-ink-200" />
          <div>
            <div className="text-xs text-ink-500">Plan</div>
            <div className="text-sm font-medium">{sub ? (sub.plan === "monthly" ? "Mesečni" : "Godišnji") : "Besplatan"}</div>
          </div>
          {!sub && (
            <Link href="/settings?tab=billing" className="btn btn-primary btn-sm">
              Nadogradi
            </Link>
          )}
        </div>
      </div>

      {sub?.status === "past_due" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Naplata pretplate nije prošla. <Link href="/settings?tab=billing" className="underline">Ažuriraj karticu</Link> da bi dobio nove tokene.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card href="/create/photo" title="Slika iz fotografije" text="Pošalji svoju fotografiju i opiši novu scenu." cost={TOKEN_COST.image_from_photo} />
        <Card href="/create/text" title="Tekst za objavu" text="Caption, hashtag-ovi i poziv na akciju." cost={TOKEN_COST.text} />
        <Card href="/create/image" title="Slika iz opisa" text="Fotorealistična slika iz jedne rečenice." cost={TOKEN_COST.image_from_prompt} />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink-900">Poslednje</h2>
          <Link href="/history" className="text-sm text-brand-700 hover:underline">
            Cela istorija
          </Link>
        </div>
        {!recent || recent.length === 0 ? (
          <div className="card px-6 py-10 text-center text-sm text-ink-500">Još ništa nisi napravio. Kreni od jedne od kartica iznad.</div>
        ) : (
          <ul className="card divide-y divide-ink-100">
            {recent.map((g) => (
              <li key={g.id}>
                <Link href={`/history/${g.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ink-50">
                  {g.output_image_path && thumbs.get(g.output_image_path) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbs.get(g.output_image_path)} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xs font-semibold text-brand-700">Aa</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{g.prompt}</p>
                    <p className="text-xs text-ink-500">
                      {TYPE_LABELS[g.type as keyof typeof TYPE_LABELS]} · {new Date(g.created_at).toLocaleString("sr-RS")}
                    </p>
                  </div>
                  <span className={`badge ${g.status === "completed" ? "badge-green" : g.status === "failed" ? "badge-red" : "badge-gray"}`}>
                    {STATUS_LABELS[g.status as keyof typeof STATUS_LABELS]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Card({ href, title, text, cost }: { href: string; title: string; text: string; cost: number }) {
  return (
    <Link href={href} className="card card-pad group transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)] hover:ring-brand-300">
      <div className="flex items-start justify-between">
        <span className="font-semibold text-ink-900 group-hover:text-brand-700">{title}</span>
        <span className="badge badge-gray">{cost} tokena</span>
      </div>
      <p className="mt-2 text-sm text-ink-500">{text}</p>
    </Link>
  );
}
