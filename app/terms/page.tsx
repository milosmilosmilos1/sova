import Link from "next/link";

export const metadata = { title: "Uslovi korišćenja · Sova" };

// Nacrt. Pre lansiranja pravnik treba da pregleda; Stripe traži javne uslove.
export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 text-sm leading-relaxed">
      <Link href="/" className="underline">
        ← Sova
      </Link>
      <h1 className="mt-4 text-xl font-semibold">Uslovi korišćenja</h1>
      <p className="text-gray-500">Verzija 1, 22.10.2026. Nacrt.</p>

      <h2 className="mt-6 font-medium">1. Šta je Sova</h2>
      <p>Sova je web aplikacija koja pomoću AI modela pravi tekstove i slike za objave na društvenim mrežama. Rezultate dobijaš kao predlog i sam odlučuješ šta ćeš objaviti.</p>

      <h2 className="mt-6 font-medium">2. Nalog i tokeni</h2>
      <p>Za korišćenje je potreban nalog. Novi nalog dobija 50 besplatnih tokena. Tekst košta 2, slika 8 tokena. Tokeni se skidaju tek kad rezultat uspešno stigne; ako generisanje ne uspe, tokeni se vraćaju. Tokeni ne ističu i ne mogu se zameniti za novac.</p>

      <h2 className="mt-6 font-medium">3. Pretplata</h2>
      <p>Mesečni plan je 39 $ za 500 tokena mesečno. Godišnji plan je 199 $ za 6000 tokena, koji se dodeljuju odjednom pri uplati. Pretplatu možeš otkazati u svakom trenutku kroz portal; ostaje aktivna do kraja plaćenog perioda. Naplatu obrađuje Stripe.</p>

      <h2 className="mt-6 font-medium">4. Tvoj sadržaj</h2>
      <p>Fotografije koje pošalješ i rezultati koje dobiješ su tvoji. Dajući nam fotografiju, dozvoljavaš da je prosledimo AI servisu (Google Gemini) radi obrade. Ne koristimo tvoje fotografije za treniranje modela niti ih delimo sa trećim licima osim radi obrade.</p>

      <h2 className="mt-6 font-medium">5. Šta ne smeš</h2>
      <p>Ne smeš da koristiš Sovu za pravljenje sadržaja koji krši tuđa prava, obmanjuje, ili je nezakonit. Nalog koji zloupotrebljava servis može biti blokiran.</p>

      <h2 className="mt-6 font-medium">6. AI rezultati</h2>
      <p>AI može da pogreši. Proveri tekst i sliku pre objave. Ne garantujemo tačnost ni poslovni rezultat objava.</p>

      <h2 className="mt-6 font-medium">7. Promene</h2>
      <p>Uslove možemo da menjamo; o bitnim promenama obaveštavamo mejlom.</p>
    </main>
  );
}
