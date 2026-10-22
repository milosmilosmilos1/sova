// Labele bez "use client", da ih mogu koristiti i server komponente.

export const TYPE_LABELS = {
  text: "Tekst",
  image_from_prompt: "Slika iz opisa",
  image_from_photo: "Slika iz fotografije",
} as const;

export const STATUS_LABELS = {
  pending: "Čeka",
  processing: "U toku",
  completed: "Gotovo",
  failed: "Nije uspelo",
} as const;

export const PLATFORM_LABELS = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  x: "X (Twitter)",
  general: "Opšte",
} as const;

export const RATIO_LABELS = {
  "1:1": "1:1 · kvadrat, Instagram post",
  "3:4": "3:4 · portret, Instagram feed",
  "4:3": "4:3 · pejzaž",
  "9:16": "9:16 · Story, Reels, TikTok",
  "16:9": "16:9 · YouTube, LinkedIn",
} as const;

export const TONE_LABELS = {
  prijateljski: "Prijateljski",
  profesionalan: "Profesionalan",
  duhovit: "Duhovit",
  luksuzan: "Luksuzan",
} as const;

export function statusBadge(status: keyof typeof STATUS_LABELS) {
  if (status === "completed") return "badge badge-green";
  if (status === "failed") return "badge badge-red";
  return "badge badge-gray";
}
