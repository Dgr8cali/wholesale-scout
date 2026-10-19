import type { Metadata } from "next";
import { pageTitle } from "@/lib/workspaces";

/** The browser tab: "New run · Wholesale · Wholesale Scout" (the page itself is a client component). */
export const metadata: Metadata = { title: pageTitle("/new-run", null) };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
