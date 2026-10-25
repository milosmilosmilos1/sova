import { UrlForm } from './demo-context'
import { OwlMark } from './owl-mark'
import { Accent } from './section'

/** Završni poziv (D-098); napomena ispod forme prati flag `registration_open`. */
export function FinalCta({
  registrationOpen,
  freeTokens,
}: {
  registrationOpen: boolean
  freeTokens: number | null
}) {
  return (
    <section className="px-6 pt-5 pb-[110px]">
      <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[28px] border border-l-line/14 bg-l-cta px-6 py-[84px] text-center">
        <div aria-hidden className="l-cta-glow pointer-events-none absolute inset-0" />
        <div aria-hidden className="l-grid-44 pointer-events-none absolute inset-0" />
        <div className="relative flex flex-col items-center">
          <OwlMark size="cta" />
          <h2 className="mt-8 text-[clamp(34px,4.6vw,56px)] leading-[1.04] font-semibold tracking-[-0.04em] text-balance">
            Pustite Sovu da vodi <Accent>vaše mreže</Accent>
          </h2>
          <p className="mt-4 max-w-[480px] text-[17px] leading-[1.55] text-pretty text-l-muted">
            Unesite sajt i za nekoliko minuta dobijate profil brenda, strategiju i prve objave.
          </p>
          <UrlForm variant="cta" />
          <p className="mt-3.5 text-[12.5px] text-l-dim">
            {registrationOpen
              ? `Bez kartice.${freeTokens ? ` ${freeTokens} tokena za probu.` : ''}`
              : 'Aplikacija je u izradi. Registracija stiže uskoro.'}
          </p>
        </div>
      </div>
    </section>
  )
}
