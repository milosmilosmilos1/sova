import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

// Jedan Stripe klijent. Baca NOT_CONFIGURED dok ključ nije u env-u, pa rute
// vraćaju razumljivu poruku umesto da pucaju.
let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError("NOT_CONFIGURED", "Plaćanje još nije podešeno.");
  }
  if (!client) {
    client = new Stripe(env.STRIPE_SECRET_KEY, {
      typescript: true,
      appInfo: { name: "Sova", url: env.NEXT_PUBLIC_APP_URL },
    });
  }
  return client;
}

export function getWebhookSecret(): string {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError("NOT_CONFIGURED", "Webhook još nije podešen.");
  }
  return env.STRIPE_WEBHOOK_SECRET;
}

export type { Stripe };
