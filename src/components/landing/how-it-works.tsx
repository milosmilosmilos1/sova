import { faCheck, faGlobe } from '@fortawesome/free-solid-svg-icons'
import { useLocale, useTranslations } from 'next-intl'

import { SECTION_IDS } from '@/i18n/paths'

import { ApproveDemo, ConnectDemo } from './how-demos'
import { Fa } from './icons'
import { DemoCard, Section, SectionHeading } from './section'

/** Sekcija „Kako radi u tri koraka” (D-098), na jeziku strane (D-130). */
function UrlStepVisual() {
  const t = useTranslations('site.how')
  const demo = useTranslations('site.demo')
  return (
    <div className="flex h-full flex-col justify-center gap-4 p-6">
      <div className="flex h-[46px] items-center gap-2.5 rounded-xl border border-l-accent/50 bg-l-inner pr-1.5 pl-3.5 shadow-[0_0_0_4px_rgba(61,169,252,0.08)]">
        <Fa icon={faGlobe} className="text-l-dim" style={{ fontSize: 13 }} />
        <span className="text-sm">{demo('domain')}</span>
        <span className="-ml-1.5 h-4 w-[1.5px] bg-l-accent motion-safe:animate-l-blink" />
        <span className="ml-auto rounded-lg bg-l-accent px-3 py-[7px] text-[12.5px] font-semibold text-l-on-accent">
          {t('analyse')}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(['logo', 'colours', 'services', 'tone', 'audience'] as const).map((chip) => (
          <span
            key={chip}
            className="flex items-center gap-1.5 rounded-full bg-l-chip px-2.5 py-[5px] text-xs text-l-text-2"
          >
            <Fa icon={faCheck} className="text-l-success" style={{ fontSize: 9 }} />
            {t(`chips.${chip}`)}
          </span>
        ))}
      </div>
    </div>
  )
}

export function HowItWorks() {
  const t = useTranslations('site.how')
  const locale = useLocale()
  return (
    <Section id={SECTION_IDS[locale].how}>
      <SectionHeading title={t('title')} sub={t('sub')} />
      <div className="flex flex-wrap gap-4">
        <DemoCard
          className="flex-[1_1_320px]"
          hover={false}
          visualHeight={220}
          visual={<UrlStepVisual />}
          badge="01"
          title={t('steps.url.title')}
        >
          {t('steps.url.text')}
        </DemoCard>
        <DemoCard
          className="flex-[1_1_320px]"
          hover={false}
          visualHeight={220}
          visual={<ConnectDemo />}
          badge="02"
          title={t('steps.connect.title')}
        >
          {t('steps.connect.text')}
        </DemoCard>
        <DemoCard
          className="flex-[1_1_320px]"
          hover={false}
          visualHeight={220}
          visual={<ApproveDemo />}
          badge="03"
          title={t('steps.approve.title')}
        >
          {t('steps.approve.text')}
        </DemoCard>
      </div>
    </Section>
  )
}
