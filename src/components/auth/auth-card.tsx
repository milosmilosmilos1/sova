import type { ReactNode } from 'react'

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="relative isolate">
      <div aria-hidden className="bg-grid bg-grid-fade absolute inset-0 -z-10" />
      <div aria-hidden className="bg-glow absolute inset-0 -z-10" />
      <div className="mx-auto w-full max-w-md px-4 py-16">
        <div className="rounded-xl border bg-card/85 p-6 shadow-sm backdrop-blur sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
