import type { NextRequest } from "next/server";
import { withApi, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/get-user";
import { enforceRateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { MAX_UPLOAD_BYTES, processUpload } from "@/lib/images";
import { buildPath, uploadBuffer, signedUrl } from "@/lib/storage";

export const maxDuration = 60;

// POST /api/uploads (multipart, polje "file") → putanja + potpisani URL.
// Veličina se gleda pre čitanja (Content-Length) i posle. Format po bajtovima.
export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser();
  await enforceRateLimit("upload", user.id);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) {
    throw new AppError("FILE_TOO_LARGE", `Fajl je prevelik. Najviše ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError("VALIDATION_ERROR", "Očekujem multipart/form-data sa poljem file.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new AppError("VALIDATION_ERROR", "Nedostaje fajl (polje file).");
  }

  const input = Buffer.from(await file.arrayBuffer());
  const img = await processUpload(input, { maxBytes: MAX_UPLOAD_BYTES });
  const path = await uploadBuffer("uploads", buildPath(user.id, img.ext), img.buffer, img.mimeType);
  const url = await signedUrl("uploads", path);

  return ok({ path, url, width: img.width, height: img.height, bytes: img.buffer.length });
});
