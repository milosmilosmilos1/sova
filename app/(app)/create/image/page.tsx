import { getCurrentUser } from "@/lib/auth/get-user";
import { TOKEN_COST } from "@/lib/tokens";
import { ImageForm } from "@/components/generation/image-form";

export default async function CreateImagePage() {
  const user = (await getCurrentUser())!;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Slika iz opisa</h1>
          <p className="page-sub">Opiši šta želiš na slici, izaberi format.</p>
        </div>
        <span className="badge badge-blue">
          {TOKEN_COST.image_from_prompt} tokena · imaš {user.profile.token_balance}
        </span>
      </div>
      <ImageForm mode="image" cost={TOKEN_COST.image_from_prompt} />
    </div>
  );
}
