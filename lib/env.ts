import "server-only";
import { z } from "zod";

// Sve tajne se čitaju samo ovde. Ako nešto fali, aplikacija pada na startu
// sa jasnom porukom, a ne usred zahteva.

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  GEMINI_API_KEY: z.string().min(1),
  GEMINI_TEXT_MODEL: z.string().default("gemini-3.6-flash"),
  GEMINI_TEXT_FALLBACK_MODEL: z.string().default("gemini-3.5-flash-lite"),
  GEMINI_IMAGE_MODEL: z.string().default("gemini-3.1-flash-image"),
  GEMINI_IMAGE_FALLBACK_MODEL: z.string().default("gemini-3.1-flash-lite-image"),

  // Stripe je opcion do faze 7; rute koje ga koriste same proveravaju.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_MONTHLY: z.string().optional(),
  STRIPE_PRICE_YEARLY: z.string().optional(),

  // Opcion do faze 8.
  IMPERSONATION_SECRET: z.string().min(32).optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("\n  ");
  throw new Error(`Nedostaju ili su pogrešne env promenljive:\n  ${missing}`);
}

export const env = parsed.data;
