import type { NextRequest } from "next/server";
import { withApi, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { MAX_LOGO_BYTES, processUpload } from "@/lib/images";
import { buildPath, uploadBuffer, signedUrl, removeObject } from "@/lib/storage";

// POST /api/uploads/logo → bucket logos, upisuje businesses.logo_path.
export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser({ allowUnonboarded: true });
  await enforceRateLimit("upload", user.id);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError("VALIDATION_ERROR", "Očekujem multipart/form-data sa poljem file.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("VALIDATION_ERROR", "Nedostaje fajl (polje file).");

  const img = await processUpload(Buffer.from(await file.arrayBuffer()), { maxBytes: MAX_LOGO_BYTES, maxSide: 1024 });
  const path = await uploadBuffer("logos", buildPath(user.id, img.ext), img.buffer, img.mimeType);

  const supabase = await createClient();
  const { data: before } = await supabase.from("businesses").select("logo_path").eq("user_id", user.id).maybeSingle();
  const { error } = await supabase.from("businesses").update({ logo_path: path }).eq("user_id", user.id);
  if (error) {
    await removeObject("logos", path);
    throw new AppError("VALIDATION_ERROR", "Prvo sačuvaj podatke o biznisu, pa onda logo.");
  }
  if (before?.logo_path) await removeObject("logos", before.logo_path);

  return ok({ path, url: await signedUrl("logos", path) });
});
