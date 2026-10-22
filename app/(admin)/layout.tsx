import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";
import { LogoutButton } from "@/components/app/logout-button";

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
      <header className="border-b border-gray-200 bg-gray-50">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3 text-sm">
          <Link href="/admin" className="font-semibold">
            Sova admin
          </Link>
          <Link href="/admin/users">Korisnici</Link>
          <Link href="/admin/audit">Audit</Link>
          <Link href="/dashboard" className="ml-auto text-gray-600">
            ← Aplikacija
          </Link>
          <span className="text-gray-500">{real.email}</span>
          <LogoutButton />
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
