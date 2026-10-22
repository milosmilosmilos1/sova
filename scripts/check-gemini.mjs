// Smoke test za Gemini ključ i modele iz .env.local.
// Pokretanje:  node --env-file=.env.local scripts/check-gemini.mjs
// Ne ispisuje ključ.

import { GoogleGenAI } from "@google/genai";

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("GEMINI_API_KEY nije u .env.local");
  process.exit(1);
}

const wanted = [
  process.env.GEMINI_TEXT_MODEL ?? "gemini-3.6-flash",
  process.env.GEMINI_TEXT_FALLBACK_MODEL ?? "gemini-3.5-flash-lite",
  process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image",
  process.env.GEMINI_IMAGE_FALLBACK_MODEL ?? "gemini-3.1-flash-lite-image",
];

const ai = new GoogleGenAI({ apiKey: key });

// 1. Lista modela: da li ključ radi i da li naši modeli postoje.
const available = new Set();
for await (const m of await ai.models.list({ config: { pageSize: 100 } })) {
  available.add(m.name.replace(/^models\//, ""));
}
console.log(`Ključ radi. Dostupno modela: ${available.size}`);
for (const name of wanted) {
  console.log(`  ${available.has(name) ? "OK " : "NEMA"}  ${name}`);
}

// 2. Jedan pravi poziv tekst modela, da vidimo da generisanje prolazi.
const textModel = wanted[0];
const t0 = Date.now();
const res = await ai.models.generateContent({
  model: textModel,
  contents: "Odgovori sa tačno dve reči na srpskom: pozdrav za kafić.",
});
console.log(`\n${textModel} odgovorio za ${Date.now() - t0} ms: "${res.text?.trim()}"`);
