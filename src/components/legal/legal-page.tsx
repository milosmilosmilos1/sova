import type { ReactNode } from 'react'

import { company } from '@/config/company'

export function LegalPage({
  title,
  titleEn,
  children,
}: {
  title: string
  titleEn: string
  children: ReactNode
}) {
  return (
    <article className="prose prose-neutral dark:prose-invert mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">
        {titleEn} · {company.legalName} · poslednja izmena / last updated: {company.legalUpdatedAt}
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
