import Link from "next/link";

export const metadata = { title: "Privatnost · Sova" };

// Nacrt. Pre lansiranja pravnik treba da pregleda.
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 text-sm leading-relaxed">
      <Link href="/" className="underline">
        ← Sova
      </Link>
      <h1 className="mt-4 text-xl font-semibold">Politika privatnosti</h1>
      <p className="text-gray-500">Verzija 1, 22.10.2026. Nacrt.</p>

      <h2 className="mt-6 font-medium">Šta čuvamo</h2>
      <p>Mejl, ime, lozinku (heširanu), podatke o biznisu koje sam uneseš, fotografije koje pošalješ, rezultate generisanja i evidenciju tokena. Za plaćanje čuvamo samo Stripe identifikatore; brojeve kartica ne vidimo.</p>

      <h2 className="mt-6 font-medium">Ko još vidi podatke</h2>
      <p>Supabase (baza i fajlovi), Google (Gemini, obrada teksta i slika), Stripe (naplata), Vercel (hosting). Svaki od njih obrađuje samo ono što mu treba za svoj deo posla.</p>

      <h2 className="mt-6 font-medium">Koliko dugo</h2>
      <p>Dok imaš nalog. Kad obrišeš nalog, brišemo profil, biznis, generacije i fajlove. Evidencija plaćanja ostaje onoliko koliko zakon traži.</p>

      <h2 className="mt-6 font-medium">Tvoja prava</h2>
      <p>Možeš da vidiš, izmeniš i obrišeš svoje podatke u podešavanjima. Za sve ostalo piši na adresu podrške sa sajta.</p>

      <h2 className="mt-6 font-medium">Kolačići</h2>
      <p>Koristimo samo kolačiće neophodne za prijavu. Nema reklamnih kolačića.</p>
    </main>
  );
}
