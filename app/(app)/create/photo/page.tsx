import { getCurrentUser } from "@/lib/auth/get-user";
import { TOKEN_COST } from "@/lib/tokens";
import { ImageForm } from "@/components/generation/image-form";

export default async function CreatePhotoPage() {
  const user = (await getCurrentUser())!;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Slika iz fotografije</h1>
        <p className="text-sm text-gray-600">
          Pošalji svoju fotografiju i opiši kakvu sliku želiš od nje. Košta {TOKEN_COST.image_from_photo} tokena, imaš{" "}
          {user.profile.token_balance}.
        </p>
      </div>
      <ImageForm mode="photo" cost={TOKEN_COST.image_from_photo} />
    </div>
  );
}
