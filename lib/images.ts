import "server-only";
import sharp, { type Metadata } from "sharp";
import { AppError } from "@/lib/errors";

// Provera i normalizacija slika koje korisnik pošalje. Format se čita iz
// bajtova (ne iz ekstenzije), EXIF rotacija se primeni, velike slike se
// smanje. Izlaz je uvek JPEG.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_SIDE_PX = 2048;
const ALLOWED = new Set(["jpeg", "png", "webp"]);

export type ProcessedImage = {
  buffer: Buffer;
  mimeType: "image/jpeg";
  ext: "jpg";
  width: number;
  height: number;
  originalFormat: string;
};

export async function processUpload(input: Buffer, opts: { maxBytes: number; maxSide?: number } = { maxBytes: MAX_UPLOAD_BYTES }): Promise<ProcessedImage> {
  if (input.length === 0) throw new AppError("VALIDATION_ERROR", "Fajl je prazan.");
  if (input.length > opts.maxBytes) {
    throw new AppError("FILE_TOO_LARGE", `Fajl je prevelik. Najviše ${Math.round(opts.maxBytes / 1024 / 1024)} MB.`);
  }

  let meta: Metadata;
  try {
    meta = await sharp(input, { failOn: "none" }).metadata();
  } catch {
    throw new AppError("UNSUPPORTED_FORMAT", "Slika ne može da se otvori. Probaj jpg, png ili webp.");
  }
  if (!meta.format || !ALLOWED.has(meta.format)) {
    throw new AppError("UNSUPPORTED_FORMAT");
  }
  if (meta.pages && meta.pages > 1) {
    throw new AppError("UNSUPPORTED_FORMAT", "Animirane slike nisu podržane.");
  }
  if (!meta.width || !meta.height || meta.width < 64 || meta.height < 64) {
    throw new AppError("VALIDATION_ERROR", "Slika je premala. Bar 64×64 px.");
  }

  const maxSide = opts.maxSide ?? MAX_SIDE_PX;
  try {
    const out = await sharp(input, { failOn: "none" })
      .rotate() // EXIF orijentacija sa telefona
      .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }) // png/webp providnost → bela
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return {
      buffer: out.data,
      mimeType: "image/jpeg",
      ext: "jpg",
      width: out.info.width,
      height: out.info.height,
      originalFormat: meta.format,
    };
  } catch (e) {
    console.error("[images] obrada", e);
    throw new AppError("UNSUPPORTED_FORMAT", "Slika je oštećena ili ne može da se obradi.");
  }
}

/** Generisane slike iz AI-ja: samo proveri i normalizuj na JPEG bez gubitka kvaliteta. */
export async function normalizeGenerated(input: Buffer): Promise<{ buffer: Buffer; width: number; height: number }> {
  const out = await sharp(input).jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true });
  return { buffer: out.data, width: out.info.width, height: out.info.height };
}
