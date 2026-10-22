import { getCurrentUser } from "@/lib/auth/get-user";
import { TOKEN_COST } from "@/lib/tokens";
import { ImageForm } from "@/components/generation/image-form";

export default async function CreateImagePage() {
  const user = (await getCurrentUser())!;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Slika iz opisa</h1>
        <p className="text-sm text-gray-600">
          Opiši šta želiš na slici. Košta {TOKEN_COST.image_from_prompt} tokena, imaš {user.profile.token_balance}.
        </p>
      </div>
      <ImageForm mode="image" cost={TOKEN_COST.image_from_prompt} />
    </div>
  );
}
