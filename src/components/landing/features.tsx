import { faCheck, faChevronLeft, faChevronRight, faUserPlus } from '@fortawesome/free-solid-svg-icons'
import Image from 'next/image'

import { cn } from 'cn'

import { AutopilotDemo, ReachDemo, ScriptDemo } from './feature-demos'
import { Fa } from './icons'
import { PlatformTile } from './platform-tile'
import { byKey } from './platforms'
import { Accent, DemoCard, Section, SectionHeading } from './section'

/** Sekcija „Funkcije” (D-098): šest kartica u bento rasporedu, primer brenda „Pekara Zrno”. */
function BrandBrainVisual() {
  return (
    <>
      <div className="absolute top-7 -bottom-[30px] left-7 w-[60%] overflow-hidden rounded-xl border border-l-line/18 bg-white shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)]">
        <div className="flex h-[30px] items-center gap-1.5 bg-[#EEF1F5] px-2.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-2 rounded-full bg-[#D5DAE1]" />
          ))}
          <span className="ml-2.5 rounded-md bg-white px-3 py-[3px] text-[11px] text-l-social-meta">
            pekarazrno.rs
          </span>
        </div>
        <div className="relative h-full bg-[#3B2416]">
          <Image
            src="/landing/hleb.jpg"
            alt=""
            fill
            sizes="(min-width: 1024px) 480px, 60vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(30,18,10,0.85),rgba(30,18,10,0.1))]" />
          <div className="absolute top-5 left-[22px] flex gap-3.5 text-[10.5px] whitespace-nowrap text-white/75">
            <span className="font-bold text-[#F3E6D3]">ZRNO</span>
            <span>Ponuda</span>
            <span>O nama</span>
            <span>Kontakt</span>
          </div>
          <div className="absolute top-[70px] left-[22px] max-w-[200px] text-[22px] leading-[1.15] font-semibold tracking-[-0.02em] text-[#F3E6D3]">
            Hleb kakav se nekad pekao.
          </div>
          <div className="absolute top-[138px] left-[22px] rounded-md bg-[#C98B4B] px-3 py-1.5 text-[11px] font-semibold text-[#1E120A]">
            Pogledajte ponudu
          </div>
        </div>
      </div>
      <div className="absolute top-[34px] right-[22px] flex w-[min(44%,290px)] flex-col gap-3.5 rounded-[14px] border border-l-line/20 bg-[rgba(15,23,39,0.95)] p-4 shadow-[0_24px_50px_-16px_rgba(0,0,0,0.8)] backdrop-blur-[8px]">
        <div className="flex items-center justify-between">
          <span className="font-l-mono text-[10.5px] tracking-[0.08em] text-l-accent">PROFIL BRENDA</span>
          <span className="flex items-center gap-[5px] text-[11px] text-l-success">
            <Fa icon={faCheck} style={{ fontSize: 9 }} />
            gotovo
          </span>
        </div>
        <div>
          <div className="mb-1.5 text-[11px] text-l-dim">Boje</div>
          <div className="flex gap-[5px]">
            {['#3B2416', '#C98B4B', '#F3E6D3', '#6E7F4F'].map((c, i) => (
              <span
                key={c}
                className="h-[22px] flex-1 rounded-[5px]"
                style={{
                  background: c,
                  boxShadow: i === 0 ? 'inset 0 0 0 1px rgba(255,255,255,0.14)' : undefined,
                }}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[11px] text-l-dim">Ton</div>
          <div className="flex flex-wrap gap-1">
            {['Topao', 'Domaći', 'Bez žargona'].map((t) => (
              <span key={t} className="rounded-full bg-l-chip px-2 py-[3px] text-[11.5px] text-l-text-2">
                {t}
              </span>
            ))}
          </div>
        </div>
        {/* na uskom ekranu kartica profila nema mesta za činjenice */}
        <div className="hidden sm:block">
          <div className="mb-1 text-[11px] text-l-dim">Činjenice</div>
          <div className="text-xs leading-normal text-l-text-2">
            Peku od 1998. · Kvasac star 20 godina · Otvoreno od 6:30
          </div>
        </div>
      </div>
    </>
  )
}

type Chip = Parameters<typeof byKey>[0]
const WEEK: Array<{ d: string; n: number; chips: Chip[]; today?: boolean; dim?: boolean }> = [
  { d: 'PON', n: 2, chips: ['instagram', 'facebook'] },
  { d: 'UTO', n: 3, chips: [] },
  { d: 'SRE', n: 4, chips: ['tiktok'] },
  { d: 'ČET', n: 5, chips: ['linkedin'] },
  { d: 'PET', n: 6, chips: ['instagram', 'google_business'], today: true },
  { d: 'SUB', n: 7, chips: ['pinterest'] },
  { d: 'NED', n: 8, chips: [], dim: true },
]

function CalendarVisual() {
  return (
    <div className="h-full overflow-hidden p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-semibold">2–8. novembar</span>
        <span aria-hidden className="flex gap-1">
          {[faChevronLeft, faChevronRight].map((icon, i) => (
            <span
              key={i}
              className="flex size-6 items-center justify-center rounded-[7px] border border-l-line/16 text-l-muted"
            >
              <Fa icon={icon} style={{ fontSize: 9 }} />
            </span>
          ))}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-[5px]">
        {WEEK.map((day) => (
          <div key={day.d} className="flex flex-col items-stretch gap-[5px]">
            <span
              className={cn(
                'text-center font-l-mono text-[9.5px]',
                day.today ? 'text-l-accent' : 'text-l-dim',
              )}
            >
              {day.d}
            </span>
            <span
              className={cn(
                'text-center text-[13px]',
                day.today
                  ? 'rounded-md bg-l-accent font-semibold text-l-on-accent'
                  : day.dim
                    ? 'text-l-dim'
                    : 'text-l-text-2',
              )}
            >
              {day.n}
            </span>
            {day.chips.map((key, i) => (
              <PlatformTile
                key={key}
                p={byKey(key)}
                size="100%"
                radius={6}
                glyph={10}
                googleSize={10}
                shadowOffset={1}
                className="h-[22px]"
                style={
                  day.today && i === 0 ? { boxShadow: '0 0 0 2px #0E1525, 0 0 0 3px #F2B552' } : undefined
                }
              />
            ))}
          </div>
        ))}
      </div>
      <div className="absolute inset-x-5 bottom-[18px] flex items-start gap-2.5 rounded-xl border border-l-line/18 bg-l-raised p-3 shadow-[0_18px_36px_-14px_rgba(0,0,0,0.8)]">
        <Image
          src="/landing/osoba-jelena.jpg"
          alt=""
          width={28}
          height={28}
          className="size-7 flex-none rounded-full bg-l-img object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-l-muted">
            <b className="font-semibold text-l-text">Jelena</b> · klijent
          </div>
          <div className="mt-[3px] text-[13px] leading-[1.4]">Može, samo pomerite na 9:00.</div>
        </div>
        <span className="flex items-center gap-[5px] rounded-[7px] bg-l-success/14 px-2 py-1 text-[11px] font-medium whitespace-nowrap text-l-success">
          <Fa icon={faCheck} style={{ fontSize: 9 }} />
          Odobreno
        </span>
      </div>
    </div>
  )
}

const BRANDS: Array<[string, string, string, string, 'wait' | 'ok']> = [
  ['/landing/hleb.jpg', 'Pekara Zrno', 'Novi Sad · 3 mreže', '3 čeka', 'wait'],
  ['/landing/teretana.jpg', 'Teretana Forma', 'Beograd · 4 mreže', 'Sve odobreno', 'ok'],
  ['/landing/cvecara.jpg', 'Cvećara Lala', 'Niš · 2 mreže', '1 čeka', 'wait'],
  ['/landing/bistro.jpg', 'Bistro Ugao', 'Kragujevac · 5 mreža', 'Sve odobreno', 'ok'],
]
const TEAM: Array<[string, string, string]> = [
  ['/landing/osoba-ana.jpg', 'Ana Petrović', 'Vlasnik'],
  ['/landing/osoba-marko.jpg', 'Marko Ilić', 'Urednik'],
  ['/landing/osoba-jelena.jpg', 'Jelena Kovač', 'Klijent'],
]

function AgenciesCard() {
  return (
    <div className="flex min-w-0 flex-[1_1_100%] flex-wrap overflow-hidden rounded-[20px] border border-l-line/12 bg-l-card transition-[border-color] duration-[250ms] hover:border-l-line/26">
      <div className="flex flex-[1_1_300px] flex-col justify-end p-7">
        <h3 className="text-lg font-semibold tracking-[-0.015em]">Za agencije i timove</h3>
        <p className="mt-2 max-w-[340px] text-[14.5px] leading-[1.55] text-pretty text-l-muted">
          Više brendova u jednom radnom prostoru, uloge, pozivnice i odobravanje po klijentu.
        </p>
      </div>
      <div className="flex min-w-0 flex-[2_1_520px] flex-wrap gap-4 border-l border-l-line/10 bg-l-visual p-[22px]">
        <div className="flex min-w-0 flex-[1.3_1_280px] flex-col gap-1.5">
          <div className="mb-1 font-l-mono text-[10.5px] tracking-[0.08em] text-l-dim">BRENDOVI</div>
          {BRANDS.map(([src, name, meta, status, kind], i) => (
            <div
              key={name}
              className={cn(
                'flex items-center gap-3 rounded-[11px] border px-2.5 py-[9px]',
                i === 0 ? 'border-l-accent/35 bg-l-inner' : 'border-transparent hover:bg-l-inner',
              )}
            >
              <Image
                src={src}
                alt=""
                width={34}
                height={34}
                className="size-[34px] rounded-[9px] bg-l-img object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium">{name}</div>
                <div className="text-[11.5px] text-l-dim">{meta}</div>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-[3px] text-[11px] whitespace-nowrap',
                  kind === 'wait' ? 'bg-l-warning/13 text-l-warning' : 'bg-l-success/12 text-l-success',
                )}
              >
                {status}
              </span>
            </div>
          ))}
        </div>
        <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5">
          <div className="mb-1 font-l-mono text-[10.5px] tracking-[0.08em] text-l-dim">TIM · PEKARA ZRNO</div>
          {TEAM.map(([src, name, role]) => (
            <div key={name} className="flex items-center gap-2.5 px-0.5 py-2">
              <Image
                src={src}
                alt=""
                width={30}
                height={30}
                className="size-[30px] rounded-full bg-l-img object-cover"
              />
              <div className="min-w-0 flex-1 text-[13px]">{name}</div>
              <span className="text-[11.5px] text-l-muted">{role}</span>
            </div>
          ))}
          <div className="mt-1 flex h-9 items-center justify-center gap-2 rounded-[10px] border border-dashed border-l-line/30 text-[12.5px] text-l-muted transition-colors hover:border-l-line/50 hover:text-l-text">
            <Fa icon={faUserPlus} style={{ fontSize: 11 }} />
            Pozovite člana tima
          </div>
        </div>
      </div>
    </div>
  )
}

export function Features() {
  return (
    <Section id="funkcije" alt>
      <SectionHeading
        title={
          <>
            Sve što radi agencija, <Accent>za deo cene</Accent>
          </>
        }
        sub="Šest alata koji rade zajedno, od prvog čitanja sajta do mesečnog izveštaja."
      />
      <div className="flex flex-wrap gap-4">
        <DemoCard
          className="flex-[2_1_600px]"
          visualHeight={310}
          visualClassName="overflow-hidden"
          visual={<BrandBrainVisual />}
          title="Brand Brain"
        >
          Pročita sajt i izvuče usluge, ton, publiku, boje i činjenice koje posle koristi u svakoj objavi.
        </DemoCard>
        <DemoCard className="flex-[1_1_320px]" visualHeight={310} visual={<ScriptDemo />} title="AI Studio">
          Tekst za svaku mrežu po njenim pravilima, slike i vizuali iz šablona, prevod i hashtagovi.
        </DemoCard>
        <DemoCard
          className="flex-[1_1_320px]"
          visualHeight={270}
          visual={<CalendarVisual />}
          title="Kalendar i odobravanje"
        >
          Nacrti, komentari, link za odobrenje klijentu i objava u tačno vreme, i kad promenite zonu.
        </DemoCard>
        <DemoCard
          className="flex-[1_1_320px]"
          visualHeight={270}
          visual={<AutopilotDemo />}
          title="Autopilot"
        >
          Nedeljni plan iz strategije, sa kontrolom kvaliteta, budžetom tokena i rokovima za odobrenje.
        </DemoCard>
        <DemoCard
          className="flex-[1_1_320px]"
          visualHeight={270}
          visual={<ReachDemo />}
          title="Analitika i uvidi"
        >
          Doseg, angažovanje i najbolji termini po mreži, uz nedeljne uvide šta da radite drugačije.
        </DemoCard>
        <AgenciesCard />
      </div>
    </Section>
  )
}
