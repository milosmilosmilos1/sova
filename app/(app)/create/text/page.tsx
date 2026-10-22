import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { TOKEN_COST } from "@/lib/tokens";
import { toDTO } from "@/lib/generation";
import { TextForm } from "@/components/generation/text-form";

export default async function CreateTextPage(props: PageProps<"/create/text">) {
  const user = (await getCurrentUser())!;
  const { from } = await props.searchParams;

  let fromGeneration = null;
  if (typeof from === "string" && /^[0-9a-f-]{36}$/i.test(from)) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("generations")
      .select("*")
      .eq("id", from)
      .eq("user_id", user.id)
      .eq("status", "completed")
      .not("output_image_path", "is", null)
      .maybeSingle();
    if (data) fromGeneration = await toDTO(data);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Tekst za objavu</h1>
        <p className="text-sm text-gray-600">
          Opiši temu, izaberi mrežu i ton. Fotografija je opciona. Košta {TOKEN_COST.text} tokena, imaš{" "}
          {user.profile.token_balance}.
        </p>
      </div>
      <TextForm cost={TOKEN_COST.text} fromGeneration={fromGeneration} />
    </div>
  );
}
