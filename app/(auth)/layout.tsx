import { Logo } from "@/components/ui/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-ink-50 px-4 py-10">
      <div className="mb-6">
        <Logo />
      </div>
      <div className="card card-pad w-full max-w-sm">{children}</div>
      <p className="mt-6 text-xs text-ink-400">© {new Date().getFullYear()} Sova</p>
    </main>
  );
}
