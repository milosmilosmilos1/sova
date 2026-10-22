import { z } from "zod";

export const PLATFORMS = ["instagram", "facebook", "linkedin", "tiktok", "x", "general"] as const;
export const ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;
export const TONES = ["prijateljski", "profesionalan", "duhovit", "luksuzan"] as const;

export const promptSchema = z
  .string()
  .trim()
  .min(3, "Opis mora imati bar 3 znaka.")
  .max(1000, "Opis može imati najviše 1000 znakova.");

// UUID koji klijent generiše po pokušaju; štiti od duplog klika.
export const idempotencyKeySchema = z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/, "Neispravan ključ.");

// Putanja u storage-u: {uuid}/{uuid}.jpg
export const storagePathSchema = z
  .string()
  .trim()
  .max(200)
  .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i, "Neispravna putanja fajla.");

export const generateTextSchema = z.object({
  prompt: promptSchema,
  platform: z.enum(PLATFORMS).default("instagram"),
  tone: z.enum(TONES).nullable().optional().transform((v) => v ?? null),
  input_image_path: storagePathSchema.nullable().optional().transform((v) => v ?? null),
  // Tekst za ranije generisanu sliku (iz bucket-a generated).
  from_generation_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
  idempotency_key: idempotencyKeySchema,
});

export const generateImageSchema = z.object({
  prompt: promptSchema,
  aspect_ratio: z.enum(ASPECT_RATIOS).default("1:1"),
  idempotency_key: idempotencyKeySchema,
});

export const generatePhotoSchema = z.object({
  prompt: promptSchema,
  aspect_ratio: z.enum(ASPECT_RATIOS).default("1:1"),
  input_image_path: storagePathSchema,
  idempotency_key: idempotencyKeySchema,
});

export const listGenerationsSchema = z.object({
  cursor: z.string().datetime({ offset: true }).optional(),
  type: z.enum(["text", "image_from_prompt", "image_from_photo"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const idParamSchema = z.string().uuid("Neispravan id.");
