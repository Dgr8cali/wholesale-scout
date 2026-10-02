import type { Metadata } from "next";
import { pageTitle } from "@/lib/workspaces";

/** The browser tab: "/stock/movements" titled page · workspace · Wholesale Scout (the page itself is a client component). */
export const metadata: Metadata = { title: pageTitle("/stock/movements", null) };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
