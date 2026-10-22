import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Sova", template: "%s · Sova" },
  description: "Slike i tekstovi za društvene mreže za male biznise, za minut.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sr" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <Toaster position="top-center" richColors closeButton toastOptions={{ duration: 3500 }} />
      </body>
    </html>
  );
}
