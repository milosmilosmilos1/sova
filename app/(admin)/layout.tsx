import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";
import { LogoutButton } from "@/components/app/logout-button";
import { LogoMark } from "@/components/ui/logo";

// Admin panel. Ko nije admin dobija 404 (ne otkrivamo da panel postoji).
// Radi kao PRAVI admin i kad traje impersonacija.
export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const real = user.realAdmin ?? user.profile;
  if (real.role !== "admin") notFound();
  if (real.is_blocked) redirect("/blocked");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-ink-800 bg-ink-900 text-white">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3 text-sm sm:gap-4">
          <Link href="/admin" className="mr-2 inline-flex items-center gap-2 font-semibold">
            <LogoMark className="h-7 w-7" />
            Sova admin
          </Link>
          <Link href="/admin" className="rounded-lg px-3 py-1.5 hover:bg-white/10">
            Statistike
          </Link>
          <Link href="/admin/users" className="rounded-lg px-3 py-1.5 hover:bg-white/10">
            Korisnici
          </Link>
          <Link href="/admin/audit" className="rounded-lg px-3 py-1.5 hover:bg-white/10">
            Audit
          </Link>
          <Link href="/dashboard" className="ml-auto rounded-lg px-3 py-1.5 text-ink-200 hover:bg-white/10">
            ← Aplikacija
          </Link>
          <span className="hidden text-ink-400 sm:inline">{real.email}</span>
          <LogoutButton light />
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}
