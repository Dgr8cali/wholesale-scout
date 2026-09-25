import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { AppShell } from "@/components/AppShell";
import { Providers } from "@/components/Providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Wholesale Scout",
  description: "Amazon UK wholesale research: price lists in, ranked shortlist out.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The sidebar remembers collapsed/expanded in a cookie; read it so the first paint matches.
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    // suppressHydrationWarning: next-themes sets the theme class on <html> before React hydrates.
    <html lang="en-GB" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full font-sans">
        <Providers>
          <AppShell defaultOpen={sidebarOpen}>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
