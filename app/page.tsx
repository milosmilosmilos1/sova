import Link from "next/link";
import { Logo, LogoMark } from "@/components/ui/logo";

const FEATURES = [
  {
    title: "Slika iz tvoje fotografije",
    text: "Pošalješ fotografiju proizvoda, lokala ili tima, napišeš kakvu sliku želiš, i dobiješ novu scenu koja zadržava ono što je bitno.",
    cost: "8 tokena",
  },
  {
    title: "Tekst za objavu",
    text: "Opišeš temu, izabereš mrežu i ton. Dobiješ caption, hashtag-ove i poziv na akciju, pisano kao da si ti, ne agencija.",
    cost: "2 tokena",
  },
  {
    title: "Slika iz opisa",
    text: "Nemaš fotografiju? Opišeš scenu i dobiješ fotorealističnu sliku u formatu za Instagram, Story ili LinkedIn.",
    cost: "8 tokena",
  },
];

const STEPS = [
  ["Reci nam o biznisu", "Ime, delatnost, publika, ton. Pet minuta, jednom."],
  ["Opiši šta ti treba", "Tema objave ili scena za sliku, jednom rečenicom."],
  ["Objavi", "Kopiraš tekst, preuzmeš sliku. Sve ostaje u istoriji."],
];

const FAQ = [
  ["Šta su tokeni?", "Jedinica potrošnje. Tekst košta 2, slika 8. Skidaju se tek kad rezultat stigne; ako generisanje ne uspe, vraćaju se."],
  ["Da li tokeni ističu?", "Ne. Ostaju na nalogu i posle otkazivanja pretplate."],
  ["Čije su slike i tekstovi?", "Tvoji. Koristiš ih kako hoćeš, bez navođenja izvora."],
  ["Mogu li da otkažem?", "Da, u svakom trenutku, iz podešavanja. Pretplata važi do kraja plaćenog perioda."],
  ["Na kom jeziku piše?", "Srpski ili engleski, biraš u podešavanjima biznisa."],
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-ink-200/60 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-2 text-sm">
            <a href="#cene" className="btn btn-ghost btn-sm hidden sm:inline-flex">
              Cene
            </a>
            <Link href="/login" className="btn btn-ghost btn-sm">
              Prijava
            </Link>
            <Link href="/register" className="btn btn-primary btn-sm">
              Počni besplatno
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl" />
          <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
            <span className="badge badge-blue">Za male biznise</span>
            <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
              Objave za društvene mreže, za minut, bez agencije
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-ink-500">
              Sova pravi tekstove i slike za tvoj kafić, salon, teretanu ili radnju. Ti opišeš, Sova napiše i nacrta, ti objaviš.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/register" className="btn btn-primary px-6 py-3 text-base shadow-[var(--shadow-pop)]">
                Počni besplatno, 50 tokena
              </Link>
              <a href="#kako" className="btn btn-secondary px-6 py-3 text-base">
                Kako radi
              </a>
            </div>
            <p className="mt-3 text-xs text-ink-400">Bez kartice. 50 tokena je oko 6 slika ili 25 tekstova.</p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-5 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card card-pad">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
                  <LogoMark className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-semibold text-ink-900">{f.title}</h2>
                <p className="mt-2 text-sm text-ink-500">{f.text}</p>
                <span className="badge badge-gray mt-4">{f.cost}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="kako" className="bg-white py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-semibold tracking-tight text-ink-900">Tri koraka</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map(([t, d], i) => (
                <li key={t} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-ink-900">{t}</p>
                    <p className="mt-1 text-sm text-ink-500">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="cene" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-ink-900">Cene</h2>
          <p className="mt-2 text-center text-sm text-ink-500">Tekst 2 tokena, slika 8 tokena. Tokeni ne ističu.</p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Plan name="Besplatno" price="0 $" per="" tokens="50 tokena na početku" cta="Napravi nalog" href="/register" />
            <Plan name="Mesečni" price="39 $" per="mesečno" tokens="500 tokena svakog meseca" cta="Izaberi mesečni" href="/register" featured />
            <Plan name="Godišnji" price="199 $" per="godišnje" tokens="6000 tokena odjednom" cta="Izaberi godišnji" href="/register" note="Oko 57 % jeftinije po tokenu" />
          </div>
        </section>

        <section className="bg-white py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-semibold tracking-tight text-ink-900">Pitanja</h2>
            <dl className="mt-8 divide-y divide-ink-100">
              {FAQ.map(([q, a]) => (
                <div key={q} className="py-4">
                  <dt className="font-medium text-ink-900">{q}</dt>
                  <dd className="mt-1 text-sm text-ink-500">{a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="card card-pad bg-brand-600 text-center text-white ring-0">
            <h2 className="text-2xl font-semibold tracking-tight">Prva objava za pet minuta</h2>
            <p className="mt-2 text-brand-100">Nalog je besplatan, kartica nije potrebna.</p>
            <Link href="/register" className="btn mt-6 bg-white text-brand-700 hover:bg-brand-50">
              Počni besplatno
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-500 sm:px-6">
          <span>© {new Date().getFullYear()} Sova</span>
          <nav className="flex gap-4">
            <Link href="/terms" className="hover:text-ink-900">
              Uslovi
            </Link>
            <Link href="/privacy" className="hover:text-ink-900">
              Privatnost
            </Link>
            <Link href="/login" className="hover:text-ink-900">
              Prijava
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Plan({ name, price, per, tokens, cta, href, featured, note }: { name: string; price: string; per: string; tokens: string; cta: string; href: string; featured?: boolean; note?: string }) {
  return (
    <div className={`card card-pad flex flex-col ${featured ? "ring-2 ring-brand-500 shadow-[var(--shadow-pop)]" : ""}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink-900">{name}</h3>
        {featured && <span className="badge badge-blue">Najpopularniji</span>}
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-ink-900">
        {price} <span className="text-sm font-normal text-ink-500">{per}</span>
      </p>
      <p className="mt-2 text-sm text-ink-700">{tokens}</p>
      {note && <p className="mt-1 text-xs text-emerald-700">{note}</p>}
      <Link href={href} className={`btn mt-6 ${featured ? "btn-primary" : "btn-secondary"}`}>
        {cta}
      </Link>
    </div>
  );
}
