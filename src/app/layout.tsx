import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Wholesale Scout",
  description: "Amazon UK wholesale research: price lists in, ranked shortlist out.",
};

const NAV = [
  { href: "/", label: "Runs" },
  { href: "/upload", label: "Upload" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">Wholesale Scout</Link>
            <nav className="flex gap-4 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-muted hover:text-ink">{n.label}</Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
