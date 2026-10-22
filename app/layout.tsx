import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sova",
  description: "Slike i tekstovi za društvene mreže za male biznise.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
