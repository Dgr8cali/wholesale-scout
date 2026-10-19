import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { AppShell } from "@/components/AppShell";
import { Providers } from "@/components/Providers";
import { parseWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import "./globals.css";

// IBM Plex Sans for all UI text (headings too), IBM Plex Mono (tabular figures) for every number,
// price, code, EAN and ASIN.
const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Wholesale Scout",
  description: "Amazon UK wholesale research: price lists in, ranked shortlist out.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The sidebar remembers collapsed/expanded in a cookie; read it so the first paint matches.
  const jar = await cookies();
  const sidebarOpen = jar.get("sidebar_state")?.value !== "false";
  // The workspace last used (Wholesale, Private label, Ads) opens again.
  const ws = parseWorkspace(jar.get(WORKSPACE_COOKIE)?.value);
  return (
    // suppressHydrationWarning: next-themes sets the theme class on <html> before React hydrates.
    <html lang="en-GB" className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full font-sans">
        <Providers>
          <AppShell defaultOpen={sidebarOpen} workspace={ws} qogita={!!(process.env.QOGITA_EMAIL && process.env.QOGITA_PASSWORD)}>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
