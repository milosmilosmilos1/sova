import type { ReactNode } from 'react'

import { company } from '@/config/company'

export function LegalPage({
  title,
  titleEn,
  updated = true,
  children,
}: {
  title: string
  titleEn: string
  /** datum poslednje izmene pravnih dokumenata; Kontakt ga ne prikazuje */
  updated?: boolean
  children: ReactNode
}) {
  return (
    <article className="prose prose-neutral dark:prose-invert mx-auto w-full max-w-3xl px-4 py-12 [&_a]:text-l-accent-soft [&_a]:underline [&_a]:decoration-l-accent-soft/40 [&_a]:underline-offset-2 [&_a:hover]:decoration-current">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">
        {titleEn} · {company.legalName}
        {updated ? ` · poslednja izmena / last updated: ${company.legalUpdatedAt}` : null}
      </p>
      <div className="mt-8 space-y-10 text-[15px] leading-7">{children}</div>
    </article>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-6">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}
