"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: React.ReactNode };

const I = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" />,
  photo: <path d="M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9h.01" />,
  text: <path d="M4 6h16M4 12h10M4 18h7" />,
  image: <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M12 8a4 4 0 100 8 4 4 0 000-8z" />,
  history: <path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.3M3 3v4h4M12 7v5l3 2" />,
  stats: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  settings: <path d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />,
  admin: <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z M9 12l2 2 4-4" />,
};

function Icon({ d }: { d: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d}
    </svg>
  );
}

export function SidebarNav({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  const items: Item[] = [
    { href: "/dashboard", label: "Početna", icon: <Icon d={I.home} /> },
    { href: "/create/photo", label: "Slika iz fotografije", icon: <Icon d={I.photo} /> },
    { href: "/create/text", label: "Tekst za objavu", icon: <Icon d={I.text} /> },
    { href: "/create/image", label: "Slika iz opisa", icon: <Icon d={I.image} /> },
    { href: "/history", label: "Istorija", icon: <Icon d={I.history} /> },
    { href: "/stats", label: "Statistike", icon: <Icon d={I.stats} /> },
    { href: "/settings", label: "Podešavanja", icon: <Icon d={I.settings} /> },
  ];
  if (isAdmin) items.push({ href: "/admin", label: "Admin", icon: <Icon d={I.admin} /> });

  return (
    <nav className="flex flex-col gap-1" aria-label="Glavna navigacija">
      {items.map((it) => {
        const active = path === it.href || (it.href !== "/dashboard" && path.startsWith(it.href));
        return (
          <Link key={it.href} href={it.href} onClick={onNavigate} className={`nav-link ${active ? "nav-link-active" : ""}`} aria-current={active ? "page" : undefined}>
            {it.icon}
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
