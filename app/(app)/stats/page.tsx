import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/forms/form-ui";

type Stats = {
  token_balance: number;
  totals: { text: number; image_from_prompt: number; image_from_photo: number; all: number };
  this_month: { text: number; image_from_prompt: number; image_from_photo: number; all: number };
  tokens_spent_total: number;
  tokens_spent_month: number;
  daily: { day: string; text: number; image: number; tokens: number }[];
};

export default async function StatsPage() {
  const user = (await getCurrentUser())!;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_user_stats", { p_user_id: user.id });

  if (error || !data) {
    return (
      <div className="space-y-2">
        <h1 className="page-title">Statistike</h1>
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Ne mogu da učitam statistike. Osveži stranu.</p>
      </div>
    );
  }
  const s = data as unknown as Stats;
  const max = Math.max(1, ...s.daily.map((d) => d.tokens));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Statistike</h1>
        <p className="page-sub">Koliko si čega napravio i koliko je tokena otišlo.</p>
      </div>

      {s.totals.all === 0 ? (
        <EmptyState
          title="Još nema brojki"
          text={`Imaš ${s.token_balance} tokena. Kad napraviš prvu objavu, ovde se pojavljuje pregled.`}
          action={
            <Link href="/create/text" className="btn btn-primary btn-sm">
              Napravi prvu objavu
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Stanje tokena" value={s.token_balance} accent />
            <Tile label="Potrošeno ukupno" value={s.tokens_spent_total} />
            <Tile label="Potrošeno ovog meseca" value={s.tokens_spent_month} />
            <Tile label="Ukupno napravljeno" value={s.totals.all} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <section className="card card-pad">
              <h2 className="mb-4 text-sm font-medium text-ink-700">Tokeni po danu, poslednjih 30 dana</h2>
              <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="Grafikon potrošnje tokena po danu">
                {s.daily.map((d) => (
                  <div key={d.day} className="group relative flex h-full flex-1 items-end" title={`${d.day}: ${d.tokens} tokena (${d.text} tekst, ${d.image} slika)`}>
                    <div
                      className="w-full rounded-t bg-brand-500 transition group-hover:bg-brand-700"
                      style={{ height: `${Math.round((d.tokens / max) * 100)}%`, minHeight: d.tokens ? 3 : 0 }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-xs text-ink-400">
                <span>{s.daily[0]?.day}</span>
                <span>{s.daily[s.daily.length - 1]?.day}</span>
              </div>
            </section>

            <section className="card card-pad">
              <h2 className="mb-3 text-sm font-medium text-ink-700">Po vrsti</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>Vrsta</th>
                    <th className="text-right">Ukupno</th>
                    <th className="text-right">Mesec</th>
                  </tr>
                </thead>
                <tbody>
                  <Row label="Tekst" a={s.totals.text} b={s.this_month.text} />
                  <Row label="Slika iz opisa" a={s.totals.image_from_prompt} b={s.this_month.image_from_prompt} />
                  <Row label="Slika iz fotografije" a={s.totals.image_from_photo} b={s.this_month.image_from_photo} />
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="card card-pad">
      <div className="text-xs text-ink-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${accent ? "text-brand-700" : "text-ink-900"}`}>{value}</div>
    </div>
  );
}

function Row({ label, a, b }: { label: string; a: number; b: number }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="text-right">{a}</td>
      <td className="text-right">{b}</td>
    </tr>
  );
}
