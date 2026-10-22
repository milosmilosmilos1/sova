import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <Link href="/" className="block text-center text-xl font-semibold">
          Sova
        </Link>
        {children}
      </div>
    </main>
  );
}
