import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Prijava' }

/** Puna prijava stiže u fazi 4 (Supabase Auth). */
export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-20">
      <h1 className="text-2xl font-semibold tracking-tight">Prijava</h1>
      <p className="mt-2 text-sm text-muted-foreground">Prijava još nije dostupna. Aplikacija je u izradi.</p>
    </div>
  )
}
