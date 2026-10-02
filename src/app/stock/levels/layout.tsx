import type { Metadata } from "next";
import { pageTitle } from "@/lib/workspaces";

/** The browser tab: "/stock/levels" titled page · workspace · Wholesale Scout (the page itself is a client component). */
export const metadata: Metadata = { title: pageTitle("/stock/levels", null) };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
