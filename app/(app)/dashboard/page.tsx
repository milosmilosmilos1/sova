import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { TOKEN_COST } from "@/lib/tokens";

export default async function DashboardPage() {
  const user = (await getCurrentUser())!;
  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("name")
    .eq("user_id", user.id)
    .maybeSingle();
  const { data: recent } = await supabase
    .from("generations")
    .select("id, type, status, prompt, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          {business?.name ?? user.profile.full_name ?? user.email}
        </h1>
        <p className="text-sm text-gray-600">Stanje: {user.profile.token_balance} tokena.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card href="/create/photo" title="Slika iz fotografije" cost={TOKEN_COST.image_from_photo} />
        <Card href="/create/text" title="Tekst za objavu" cost={TOKEN_COST.text} />
        <Card href="/create/image" title="Slika iz opisa" cost={TOKEN_COST.image_from_prompt} />
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Poslednje</h2>
        {!recent || recent.length === 0 ? (
          <p className="text-sm text-gray-500">Još ništa nisi napravio. Kreni od jedne od kartica iznad.</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded border border-gray-200 text-sm">
            {recent.map((g) => (
              <li key={g.id}>
                <Link href={`/history/${g.id}`} className="flex gap-3 px-3 py-2">
                  <span className="w-36 shrink-0 text-gray-500">{g.type}</span>
                  <span className="flex-1 truncate">{g.prompt}</span>
                  <span className="text-gray-500">{g.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Card({ href, title, cost }: { href: string; title: string; cost: number }) {
  return (
    <Link href={href} className="block rounded border border-gray-200 p-4 hover:border-blue-400">
      <span className="block font-medium">{title}</span>
      <span className="block text-sm text-gray-500">{cost} tokena</span>
    </Link>
  );
}
