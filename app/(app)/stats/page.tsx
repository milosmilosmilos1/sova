import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

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
        <h1 className="text-xl font-semibold">Statistike</h1>
        <p className="text-sm text-red-600">Ne mogu da učitam statistike. Osveži stranu.</p>
      </div>
    );
  }
  const s = data as unknown as Stats;
  const max = Math.max(1, ...s.daily.map((d) => d.tokens));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Statistike</h1>

      {s.totals.all === 0 ? (
        <p className="text-sm text-gray-600">Još ništa nisi napravio, pa nema brojki. Imaš {s.token_balance} tokena.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Tile label="Stanje tokena" value={s.token_balance} />
            <Tile label="Potrošeno ukupno" value={s.tokens_spent_total} />
            <Tile label="Potrošeno ovog meseca" value={s.tokens_spent_month} />
            <Tile label="Ukupno napravljeno" value={s.totals.all} />
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1">Vrsta</th>
                <th className="py-1">Ukupno</th>
                <th className="py-1">Ovog meseca</th>
              </tr>
            </thead>
            <tbody>
              <Row label="Tekst" a={s.totals.text} b={s.this_month.text} />
              <Row label="Slika iz opisa" a={s.totals.image_from_prompt} b={s.this_month.image_from_prompt} />
              <Row label="Slika iz fotografije" a={s.totals.image_from_photo} b={s.this_month.image_from_photo} />
            </tbody>
          </table>

          <section>
            <h2 className="mb-2 text-sm font-medium">Tokeni po danu, poslednjih 30 dana</h2>
            <div className="flex h-32 items-end gap-[2px]" role="img" aria-label="Grafikon potrošnje tokena po danu">
              {s.daily.map((d) => (
                <div key={d.day} className="flex-1" title={`${d.day}: ${d.tokens} tokena, ${d.text} tekst, ${d.image} slika`}>
                  <div className="w-full bg-blue-500" style={{ height: `${Math.round((d.tokens / max) * 100)}%`, minHeight: d.tokens ? 2 : 0 }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>{s.daily[0]?.day}</span>
              <span>{s.daily[s.daily.length - 1]?.day}</span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function Row({ label, a, b }: { label: string; a: number; b: number }) {
  return (
    <tr className="border-t border-gray-200">
      <td className="py-1">{label}</td>
      <td className="py-1">{a}</td>
      <td className="py-1">{b}</td>
    </tr>
  );
}
