import "server-only";
import { GoogleGenAI } from "@google/genai";
import { env } from "@/lib/env";

// Jedan klijent za ceo server. Ključ je potvrđen na Gemini Developer API-ju
// (generativelanguage.googleapis.com), ne na Vertex-u.
let client: GoogleGenAI | null = null;

export function getGemini() {
  if (!client) {
    client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return client;
}

export const models = {
  text: env.GEMINI_TEXT_MODEL,
  textFallback: env.GEMINI_TEXT_FALLBACK_MODEL,
  image: env.GEMINI_IMAGE_MODEL,
  imageFallback: env.GEMINI_IMAGE_FALLBACK_MODEL,
} as const;
