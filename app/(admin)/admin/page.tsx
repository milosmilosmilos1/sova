import { createAdminClient } from "@/lib/supabase/admin";

type AdminStats = {
  users_total: number;
  users_new_30d: number;
  users_blocked: number;
  users_onboarded: number;
  subs_active_monthly: number;
  subs_active_yearly: number;
  subs_past_due: number;
  mrr_cents: number;
  revenue_30d_cents: number;
  revenue_total_cents: number;
  generations_total: number;
  generations_30d: number;
  generations_failed_30d: number;
  generations_by_type: Record<string, number>;
  tokens_spent_30d: number;
  tokens_granted_30d: number;
};

const usd = (cents: number) => `${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

export default async function AdminHome() {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_admin_stats");
  if (error || !data) {
    return (
      <div>
        <h1 className="text-xl font-semibold">Statistike</h1>
        <p className="text-sm text-red-600">Ne mogu da učitam statistike: {error?.message}</p>
      </div>
    );
  }
  const s = data as unknown as AdminStats;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Statistike</h1>
      <Section title="Korisnici">
        <Tile label="Ukupno" value={s.users_total} />
        <Tile label="Novi, 30 dana" value={s.users_new_30d} />
        <Tile label="Završili onboarding" value={s.users_onboarded} />
        <Tile label="Blokirani" value={s.users_blocked} />
      </Section>
      <Section title="Pretplate i prihod">
        <Tile label="Mesečne aktivne" value={s.subs_active_monthly} />
        <Tile label="Godišnje aktivne" value={s.subs_active_yearly} />
        <Tile label="Neuspela naplata" value={s.subs_past_due} />
        <Tile label="MRR" value={usd(s.mrr_cents)} />
        <Tile label="Prihod, 30 dana" value={usd(s.revenue_30d_cents)} />
        <Tile label="Prihod ukupno" value={usd(s.revenue_total_cents)} />
      </Section>
      <Section title="Generisanje">
        <Tile label="Ukupno" value={s.generations_total} />
        <Tile label="30 dana" value={s.generations_30d} />
        <Tile label="Neuspelo, 30 dana" value={s.generations_failed_30d} />
        <Tile label="Tekst" value={s.generations_by_type.text ?? 0} />
        <Tile label="Slika iz opisa" value={s.generations_by_type.image_from_prompt ?? 0} />
        <Tile label="Slika iz fotografije" value={s.generations_by_type.image_from_photo ?? 0} />
      </Section>
      <Section title="Tokeni, 30 dana">
        <Tile label="Potrošeno" value={s.tokens_spent_30d} />
        <Tile label="Kupljeno" value={s.tokens_granted_30d} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium text-gray-700">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{children}</div>
    </section>
  );
}

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
