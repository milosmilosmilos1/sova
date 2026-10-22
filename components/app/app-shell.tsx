"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo, LogoMark } from "@/components/ui/logo";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { LogoutButton } from "@/components/app/logout-button";

// Desktop: fiksni sidebar levo. Telefon: gornja traka + izvlačeći meni.
export function AppShell({
  isAdmin,
  email,
  tokens,
  children,
}: {
  isAdmin: boolean;
  email: string;
  tokens: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-1">
        <Logo href="/dashboard" />
      </div>
      <SidebarNav isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
      <div className="mt-auto space-y-3 border-t border-ink-100 pt-4">
        <Link href="/settings?tab=billing" className="card flex items-center justify-between px-3 py-2.5 hover:ring-brand-200">
          <span className="text-xs text-ink-500">Tokeni</span>
          <span className="text-base font-semibold text-brand-700">{tokens}</span>
        </Link>
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="truncate text-xs text-ink-500" title={email}>
            {email}
          </span>
          <LogoutButton />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-64 shrink-0 border-r border-ink-200 bg-white lg:block">
        <div className="sticky top-0 h-screen">{sidebar}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ink-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost btn-sm -ml-2" aria-label="Otvori meni">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <Link href="/dashboard" className="inline-flex items-center gap-2">
            <LogoMark className="h-7 w-7" />
            <span className="font-semibold">Sova</span>
          </Link>
          <Link href="/settings?tab=billing" className="badge badge-blue ml-auto">
            {tokens} tokena
          </Link>
        </header>

        {open && (
          <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true">
            <button type="button" className="absolute inset-0 bg-ink-900/40" onClick={() => setOpen(false)} aria-label="Zatvori meni" />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">{sidebar}</div>
          </div>
        )}

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
