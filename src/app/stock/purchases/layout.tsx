import type { Metadata } from "next";
import { pageTitle } from "@/lib/workspaces";

/** The browser tab: "Purchases · Stock · Wholesale Scout" (the page itself is a client component). */
export const metadata: Metadata = { title: pageTitle("/stock/purchases", null) };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
